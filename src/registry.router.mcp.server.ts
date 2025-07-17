import express from "express";
import {randomUUID} from "node:crypto";
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  GetPromptRequestSchema,
  InitializeRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {mcpAgentManager} from "./registry.identity.store";
import {env} from "node:process";
import {InMemoryEventStore} from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import {ActorRefFromLogic, createActor} from "xstate";

import {authRouter, protectedResourcesRouter, requireAuth,} from "./registry.mcp.server.auth";
import {AuthInfo} from "@modelcontextprotocol/sdk/server/auth/types.js";
import clientManagerMachine, {ServerConfig,} from "./registry.mcp.client";
import {connectYjs} from "./store.yjs";
import {NamespacedDataStore} from "./registry.mcp.client.namespace";
import { InMemoryOAuthClientProvider } from "./mcp.client.auth";
 
const app = express();
app.use(express.json());
app.use(authRouter);
app.use(protectedResourcesRouter);

const doc = connectYjs("@mcp.registry");
const clientManagers = {} as Record<string, any>;
const dataStores = {} as Record<string, NamespacedDataStore>;


app.get("/oauth/callback", async function (req,res) {
  const url = new URLSearchParams(req.url!.split("?")[1]);
  const state = url.get("state")!
  const authCode =url.get("code")!;
  // const oauthProvider = RemoteOAuthClientProvider.fromState(state);
  // const {url:serverUrl, type:transportType} = store.get(oauthProvider.server) || {url:oauthProvider.serverUrl, type:"streamable"}
  // const transport =  transportType === "streamable" ? 
  //    new StreamableHTTPClientTransport(new URL(serverUrl), {authProvider: oauthProvider}) 
  //    : new SSEClientTransport(new URL(serverUrl), {authProvider: oauthProvider})
  // await transport.finishAuth(authCode); 

  InMemoryOAuthClientProvider.finishAuth(state, authCode)
  res.send(`Successfully authenticated. You can close this window.`);
  // console.log("OAuth callback ", oauthProvider.serverUrl);
  //  console.log("OAuth callback successful");
  // if (oauthProvider.tokens()) {
  //   const { access_token } = oauthProvider.tokens()!;
  //   const { sub, email, nickname, name } = jwtDecode(access_token) as {
  //     sub: string;
  //     email: string;
  //     nickname: string;
  //     name: string;
  //   }; 
  //   res.send(`Successfully authenticated ${oauthProvider.server}. You can close this window.`);
  // } else {
  //   res.send(`Failed to authenticate ${oauthProvider.server}. You can close this window.`);
  // }
})
    
// Map to store transports by session ID
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>,
};

// Map to store client manager actors and data stores by session ID
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

mcpServer.setRequestHandler(
  ListToolsRequestSchema,
  async (request, extra) => {
    const sessionId = extra.sessionId || "can_session_be_empty?"
    return {
      tools: dataStores[sessionId]?.tools.get(),
    };
  }
);

mcpServer.setRequestHandler(
  ListPromptsRequestSchema,
  async (request, extra) => {
    const sessionId = extra.sessionId || "can_session_be_empty?"
    return {
      prompts: dataStores[sessionId]?.prompts.get(),
    };
  }
);

mcpServer.setRequestHandler(
  ListResourcesRequestSchema,
  async (request, extra) => {
    const sessionId = extra.sessionId || "can_session_be_empty?"
    return {
      resources: dataStores[sessionId]?.resources.get(),
    };
  }
);

mcpServer.setRequestHandler(
  ListResourceTemplatesRequestSchema,
  async (request, extra) => {
    const sessionId = extra.sessionId || "can_session_be_empty?"
    return {
      resources: dataStores[sessionId]?.resources.get(),
      resourceTemplates: dataStores[sessionId]?.resourceTemplates.get(),
    };
  }
);

mcpServer.setRequestHandler(
  GetPromptRequestSchema,
  async (request, extra) => {
    const sessionId = extra.sessionId || "can_session_be_empty?"
    return dataStores[sessionId]?.getPrompt(request.params, extra);
  }
);
 
mcpServer.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;
  const sessionId = extra.sessionId || "can_session_be_empty?"
  try {
    return await dataStores[sessionId].callTool({name, arguments: args}, extra);
  } catch (error) {
    return {
      isError: true,
      content: {
        text: error instanceof Error ? error.message : String(error),
      }
    };
  }
});

mcpServer.setRequestHandler(
  ReadResourceRequestSchema,
  async (request, extra) => {
    try {
      const sessionId = extra.sessionId || "can_session_be_empty?"
      return await dataStores[sessionId].readResource(request.params, extra);
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
    const sessionId = extra.sessionId || "can_session_be_empty?"
    return await dataStores[sessionId].complete(request.params, extra);
  } catch (error) {
    throw new Error(
      `Completion failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});



// Helper to create a new MCP server and transport for a session
async function connectSession(
  sessionId: string,
  sessionInfo: { auth: AuthInfo; id?: string },
  transport: StreamableHTTPServerTransport | SSEServerTransport
): Promise<void> {


  const agent = mcpAgentManager.init(sessionInfo); 
  const dataStore = new NamespacedDataStore(); 
  const clientManagerActor = createActor(clientManagerMachine, {
    id: agent.id,
    input: {
      auth: sessionInfo.auth,
      sessionId: sessionId,
      store:doc.getMap<ServerConfig>(agent.id),
      dataStore,
    },
  }); 

  clientManagerActor.start();
  clientManagers[sessionId] = clientManagerActor;
  dataStores[sessionId] = dataStore;

  await mcpServer.connect(transport);
  mcpServer.onerror = console.error.bind(console);

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
app.all("/mcp/:id", async (req, res) => {
  const id = req.params.id;
  const session = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (session && transports.streamable[session]) {
    transport = transports.streamable[session];
  } else {
    const sessionId = session || randomUUID();
    transport =new StreamableHTTPServerTransport({
      eventStore: new InMemoryEventStore(),
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (sessionId) => {
        transports.streamable[sessionId] = transport;
      },
    })
     await connectSession(
      sessionId,
      { auth: req.auth as AuthInfo, id },
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
    const sessionId = session || randomUUID();
    transport = new StreamableHTTPServerTransport({ 
        eventStore: new InMemoryEventStore(),
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (sessionId) => {
            transports.streamable[sessionId] = transport;
        },
     }); 
     await connectSession(
      sessionId,
      { auth: req.auth as AuthInfo, id: req.params.id },
      transport
    );
  }
  await transport.handleRequest(req, res, req.body);
});

app.get("/sse",requireAuth, async (req, res) => {
  // Create SSE transport for legacy clients
  const transport = new SSEServerTransport("/messages", res);
  transports.sse[transport.sessionId] = transport;

  await connectSession(
    transport.sessionId,
    { auth: req.auth as AuthInfo, id: req.params.id },
    transport
  );
});
app.get("/sse/:id", async (req, res) => {
   const transport = new SSEServerTransport(`/messages/${req.params.id}`, res);
  transports.sse[transport.sessionId] = transport;

  await connectSession(
    transport.sessionId,
    { auth: req.auth as AuthInfo, id: req.params.id },
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
  console.log(`MCP Router Server running on http://localhost:${port}`);
});
