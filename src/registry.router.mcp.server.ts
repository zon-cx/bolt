import express from "express";
import {randomUUID} from "node:crypto";
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {mcpAgentManager} from "./registry.identity.store";
import {env} from "node:process";
import {InMemoryEventStore} from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import {createActor} from "xstate";

import {authRouter, requireAuth,} from "./registry.mcp.server.auth";
import {AuthInfo} from "@modelcontextprotocol/sdk/server/auth/types.js";
import clientManagerMachine, {ServerConfig,} from "./registry.mcp.client";
import {connectYjs} from "./store.yjs";
import {NamespacedDataStore} from "./registry.mcp.client.namespace";

const app = express();
app.use(express.json());
app.use(authRouter);

// Map to store transports by session ID
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>,
};
const doc = connectYjs("@mcp.registry");

// Map to store client manager actors and data stores by session ID
const clientManagers = {} as Record<string, any>;
const dataStores = {} as Record<string, NamespacedDataStore>;



// Helper to create a new MCP server and transport for a session
async function connectSession(
  sessionInfo: { session?: string; auth: AuthInfo; id?: string },
  transport: StreamableHTTPServerTransport | SSEServerTransport
): Promise<void> {
  const mcpServer = new Server(
    {
      name: "mcp-gateway-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        prompts: {
          listChanged: true,
        },
        resources: {
          listChanged: true,
          subscribe: true,
        },
        tools: {
          listChanged: true,
        },
        completions: {},
        logging: {},
      },
    }
  );

  const agent = mcpAgentManager.init(sessionInfo);

  // Create Yjs store for server configurations
  const store = doc.getMap<ServerConfig>("servers");

  // Create data store for namespaced data
  const dataStore = new NamespacedDataStore();

  // Create XState-based client manager
  const clientManagerActor = createActor(clientManagerMachine, {
    id: agent.id,
    input: {
      auth: sessionInfo.auth,
      sessionId: sessionInfo.session,
      store,
      dataStore,
    },
  });

  // Start the client manager
  clientManagerActor.start();

  // Store the actor and data store for cleanup
  if (sessionInfo.session) {
    clientManagers[sessionInfo.session] = clientManagerActor;
    dataStores[sessionInfo.session] = dataStore;
  }

  // Add the registry connection to the store
  store.set(sessionInfo.id || "registry", {
    id: sessionInfo.id || "registry",
    url: `${
      env.MCP_REGISTRY_URL ||
      "https://registry.cfapps.eu12.hana.ondemand.com/mcp"
    }/${agent.id}`,
    name: "registry",
    version: "1.0.0",
  });

  // Register handlers to proxy requests to the agent
  mcpServer.setRequestHandler(
    ListToolsRequestSchema,
    async (request, extra) => {
      return {
        tools: dataStore.tools.get(),
      };
    }
  );

  mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_, extra) => {
    return {
      prompts: dataStore.prompts.get(),
    };
  });

  mcpServer.setRequestHandler(ListResourcesRequestSchema, async (_, extra) => {
    return {
      resources: dataStore.resources.get(),
    };
  });

  mcpServer.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_, extra) => {
      return {
        resources: dataStore.resources.get(),
        resourceTemplates: dataStore.resourceTemplates.get(),
      };
    }
  );

  mcpServer.setRequestHandler(
    GetPromptRequestSchema,
    async (request, extra) => {
      return dataStore.getPrompt(request.params, extra);
    }
  );

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;

    try {
      // Use the data store's callTool method directly
      return await dataStore.callTool({name, arguments: args}, extra);
    } catch (error) {
      throw new Error(
        `Tool call failed for "${name}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });

  mcpServer.setRequestHandler(
    ReadResourceRequestSchema,
    async (request, extra) => {
      try {
        return await dataStore.readResource(request.params, extra);
      } catch (error) {
        throw new Error(
          `Resource read failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  );

  mcpServer.setRequestHandler(CompleteRequestSchema, async (request, extra) => {
    try {
      return await dataStore.complete(request.params, extra);
    } catch (error) {
      throw new Error(
        `Completion failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });

  // Connect the MCP server to the transport
  await mcpServer.connect(transport);
  mcpServer.onerror = console.error.bind(console);

  // Add debouncing to prevent infinite loops
  let resourceChangeTimeout: NodeJS.Timeout | null = null;
  let toolChangeTimeout: NodeJS.Timeout | null = null;
  let promptChangeTimeout: NodeJS.Timeout | null = null;

  const debouncedResourceChange = () => {
    if (resourceChangeTimeout) {
      clearTimeout(resourceChangeTimeout);
    }
    resourceChangeTimeout = setTimeout(() => {
      if (dataStore.resources.get().length > 0) {
        console.log("Sending resource list changed notification");
        mcpServer.sendResourceListChanged();
      }
    }, 1000); // 1 second debounce
  };

  const debouncedToolChange = () => {
    if (toolChangeTimeout) {
      clearTimeout(toolChangeTimeout);
    }
    toolChangeTimeout = setTimeout(() => {
      if (dataStore.tools.get().length > 0) {
        console.log("Sending tool list changed notification");
        mcpServer.sendToolListChanged();
      }
    }, 1000); // 1 second debounce
  };

  const debouncedPromptChange = () => {
    if (promptChangeTimeout) {
      clearTimeout(promptChangeTimeout);
    }
    promptChangeTimeout = setTimeout(() => {
      if (dataStore.prompts.get().length > 0) {
        console.log("Sending prompt list changed notification");
        mcpServer.sendPromptListChanged();
      }
    }, 1000); // 1 second debounce
  };

  // Subscribe to data store changes
  const toolsSubscription = dataStore.tools.subscribe(() => {
    debouncedToolChange();
  });

  const resourcesSubscription = dataStore.resources.subscribe(() => {
    debouncedResourceChange();
  });

  const promptsSubscription = dataStore.prompts.subscribe(() => {
    debouncedPromptChange();
  });

  // agent.onClose(() => {
  //   toolsSubscription.unsubscribe();
  //   resourcesSubscription.unsubscribe();
  //   promptsSubscription.unsubscribe();
  // });

  // Clean up transport when closed
  transport.onclose = () => {
    if (transport.sessionId) {
      delete transports[transport.sessionId];
      delete clientManagers[transport.sessionId];
      delete dataStores[transport.sessionId];
    }
    // Clear any pending timeouts
    if (resourceChangeTimeout) {
      clearTimeout(resourceChangeTimeout);
    }
    if (toolChangeTimeout) {
      clearTimeout(toolChangeTimeout);
    }
    if (promptChangeTimeout) {
      clearTimeout(promptChangeTimeout);
    }
    toolsSubscription.unsubscribe();
    resourcesSubscription.unsubscribe();
    promptsSubscription.unsubscribe();
    clientManagerActor.stop();
  };
}

app.use(async (req, res, next) => {
  console.log(`[LOG] ${req.method} ${req.url}`);
  console.log("Headers:", req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("Body:", req.body);
  }
  res.on("finish", () => {
    console.log(`[LOG] ${req.method} ${req.url} ${res.statusCode}`);
  });

  await next();
  console.log(`[LOG] [DONE] ${req.method} ${req.url} ${res.statusCode}`);
});
// Add error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error handling request:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// POST handler for client-to-server communication
app.all("/mcp/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const session = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (session && transports.streamable[session]) {
    transport = transports.streamable[session];
  } else {
    transport =new StreamableHTTPServerTransport({
      eventStore: new InMemoryEventStore(),
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.streamable[sessionId] = transport;
      },
    })
     await connectSession(
      { session, auth: req.auth as AuthInfo, id },
         transport
    );
  }
  await transport.handleRequest(req, res, req.body);
});

app.all("/mcp", requireAuth, async (req, res) => {
  const session = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (session && transports.streamable[session]) {
    transport = transports.streamable[session];
  } else {
    transport = new StreamableHTTPServerTransport({ 
        eventStore: new InMemoryEventStore(),
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
            transports.streamable[sessionId] = transport;
        },
     }); 
     await connectSession(
      { auth: req.auth as AuthInfo, session },
      transport
    );
  }
  await transport.handleRequest(req, res, req.body);
});

app.get("/sse",requireAuth, async (req, res) => {
  // Create SSE transport for legacy clients
  const session = req.header("mcp-session-id") as string | undefined;
  const transport = new SSEServerTransport("/messages", res);
  transports.sse[transport.sessionId] = transport;

  await connectSession(
    { auth: req.auth as AuthInfo, session },
    transport
  );
});
app.get("/sse/:id",requireAuth, async (req, res) => {
  // Create SSE transport for legacy clients
  const session = req.header("mcp-session-id") as string | undefined;
  const transport = new SSEServerTransport(`/messages/${req.params.id}`, res);
  transports.sse[transport.sessionId] = transport;

  await connectSession(
    { auth: req.auth as AuthInfo, session, id: req.params.id },
    transport
  );
});
app.post("/messages/:id", requireAuth, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.sse[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});
// Legacy message endpoint for older clients
app.post("/messages", requireAuth, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.sse[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

const port = parseInt(env.PORT || "8080", 10);

app.listen(port, () => {
  console.log(`MCP Gateway Server running on http://localhost:${port}`);
});
