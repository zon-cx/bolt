import express, { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CompleteRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpAgentManager, MCPAgentManager } from "./registry.identity.store";
import { env } from "node:process";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { createActor } from "xstate";
import * as Y from "yjs";

import {
  authRouter,
  getAgentAuthInfo,
  requireAuth,
} from "./registry.mcp.server.auth";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { Subscription } from "@xstate/store";
import clientManagerMachine,{  ServerConfig } from "./registry.mcp.client.xstate";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connectYjs } from "./store.yjs";

const app = express();
app.use(express.json());
app.use(authRouter);

// Map to store transports by session ID
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>,
};
const doc = connectYjs("@mcp.registry");

// Map to store client manager actors by session ID
const clientManagers = {} as Record<string, any>;

// Helper to create a new MCP server and transport for a session
async function createSessionTransport(sessionInfo: {session?: string; auth: AuthInfo; id?: string}): Promise<StreamableHTTPServerTransport> {
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
  
  // Create XState-based client manager
   const clientManagerActor = createActor(clientManagerMachine, {
    id:agent.id,
    input: {
      session: {
        store,
        auth: sessionInfo.auth,
        session: sessionInfo.session,
        id: sessionInfo.id,
        name: sessionInfo.id,
        version: "1.0.0"
      },
      store
    }
  });
  
  // Start the client manager
  clientManagerActor.start();
  
  // Store the actor for cleanup
  if (sessionInfo.session) {
    clientManagers[sessionInfo.session] = clientManagerActor;
  }
  
  // Add the registry connection to the store
  store.set(sessionInfo.id || "registry", {
    id: sessionInfo.id || "registry",
    url: `${env.MCP_REGISTRY_URL}/${agent.id}`,
    name: "registry",
    version: "1.0.0"
  });

  // Register handlers to proxy requests to the agent
  mcpServer.setRequestHandler(
    ListToolsRequestSchema,
    async (request, extra) => {
      const snapshot = clientManagerActor.getSnapshot();
      return {
        tools: snapshot.context.tools,
      };
    }
  );
  
  mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_, extra) => {
    const snapshot = clientManagerActor.getSnapshot();
    return {
      prompts: snapshot.context.prompts,
    };
  });
  
  mcpServer.setRequestHandler(ListResourcesRequestSchema, async (_, extra) => {
    const snapshot = clientManagerActor.getSnapshot();
    return {
      resources: snapshot.context.resources,
    };
  });
  
  mcpServer.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_, extra) => {
      const snapshot = clientManagerActor.getSnapshot();
      return {
        resources: snapshot.context.resources,
        resourceTemplates: snapshot.context.resourceTemplates,
      };
    }
  );
  
  mcpServer.setRequestHandler(
    GetPromptRequestSchema,
    async (request, extra) => {
      return agent.getPrompt(request.params, extra);
    }
  );
  
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    return agent.callTool(request.params, extra);
  });
  
  mcpServer.setRequestHandler(
    ReadResourceRequestSchema,
    async (request, extra) => {
      return agent.readResource(request.params, extra);
    }
  );
  
  mcpServer.setRequestHandler(CompleteRequestSchema, async (request, extra) => {
    return agent.complete(request.params, extra);
  });

  const transport = new StreamableHTTPServerTransport({
    eventStore: new InMemoryEventStore(),
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.streamable[sessionId] = transport;
    },
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
      const snapshot = clientManagerActor.getSnapshot();
      if (snapshot.context.resources.length > 0) {
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
      const snapshot = clientManagerActor.getSnapshot();
      if (snapshot.context.tools.length > 0) {
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
      const snapshot = clientManagerActor.getSnapshot();
      if (snapshot.context.prompts.length > 0) {
        console.log("Sending prompt list changed notification");
        mcpServer.sendPromptListChanged();
      }
    }, 1000); // 1 second debounce
  };
  
  // Subscribe to client manager state changes
  const clientManagerSubscription = clientManagerActor.subscribe((snapshot) => {
    // React to state changes
    if (snapshot.context.tools.length > 0) {
      debouncedToolChange();
    }
    if (snapshot.context.resources.length > 0) {
      debouncedResourceChange();
    }
    if (snapshot.context.prompts.length > 0) {
      debouncedPromptChange();
    }
  });

  agent.onClose(() => {
    clientManagerSubscription.unsubscribe();
  });

  // Clean up transport when closed
  transport.onclose = () => {
    if (transport.sessionId) {
      delete transports[transport.sessionId];
      delete clientManagers[transport.sessionId];
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
    clientManagerSubscription.unsubscribe();
    clientManagerActor.stop();
  };
  
  return transport;
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
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error handling request:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// POST handler for client-to-server communication
app.all("/mcp/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const session = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (session && transports.streamable[session]) {
    transport = transports.streamable[session];
  } else {
    transport = await createSessionTransport({session, auth:req.auth as AuthInfo, id} );
  }
  await transport.handleRequest(req, res, req.body);
});

app.all("/mcp", requireAuth, async (req, res) => {
  const session = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (session && transports.streamable[session]) {
    transport = transports.streamable[session];
  } else {
    transport = await createSessionTransport( {auth:req.auth as AuthInfo, session} );
  }
  await transport.handleRequest(req, res, req.body);
});

const port = parseInt(env.MCP_SERVER_PORT || "8080", 10);

app.listen(port, () => {
  console.log(`MCP Gateway Server running on http://localhost:${port}`);
});
