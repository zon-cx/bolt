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
  CompatibilityCallToolResultSchema,
  CompleteRequestSchema,
  Prompt,
  ResourceTemplateSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpAgentManager, MCPAgentManager } from "./registry.identity.store";
import { env } from "node:process";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";

import {
  authRouter,
  getAgentAuthInfo,
  requireAuth,
} from "./registry.mcp.server.auth";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { MCPClientConnection } from "./mcp.client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPClientManager } from "./registry.mcp.client";
const app = express();
app.use(express.json());
app.use(authRouter);
// Map to store transports by session ID
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>,
};

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

// Helper to create a new MCP server and transport for a session
async function createSessionTransport(auth: AuthInfo, id?: string) {
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

  const agent = mcpAgentManager.initAgent(getAgentAuthInfo(auth, id));
  agent.connected.once("registry", (connection) => {
    console.log("connections", connection);
    if(connection.connectionState.get() === "ready") {
      agent.updateFromRegistry(connection);
    }
     else if(connection.connectionState.get() !== "failed") {
      console.log("registry connection state", connection.connectionState.get());
      connection.connectionState.subscribe((state) => {
        if(state === "failed") {
          console.error("registry connection failed", connection.error);
        }
        if(state === "ready") {
          agent.updateFromRegistry(connection);
        }
      });
     }
     else if(connection.connectionState.get() === "failed") {
      console.error("registry connection failed", connection.error);
     }
     else {
       console.log("registry connection not found",);
     }
  });


  // Register handlers to proxy requests to the agent
  mcpServer.setRequestHandler(
    ListToolsRequestSchema,
    async (request, extra) => ({
      tools: agent.listTools(),
    })
  );
  mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_, extra) => ({
    prompts: agent.listPrompts(),
  }));
  mcpServer.setRequestHandler(ListResourcesRequestSchema, async (_, extra) => ({
    resources: agent.listResources(),
  }));
  mcpServer.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_, extra) => ({
      resourceTemplates: agent.listResourceTemplates(),
    })
  );
  mcpServer.setRequestHandler(
    GetPromptRequestSchema,
    async (request, extra) => {
      return agent.getPrompt(request.params);
    }
  );
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    return agent.callTool(request.params);
  });
  mcpServer.setRequestHandler(
    ReadResourceRequestSchema,
    async (request, extra) => {
      return agent.readResource(request.params);
    }
  );
  mcpServer.setRequestHandler(CompleteRequestSchema, async (request, extra) => {
    return agent.complete(request.params);
  });

  const transport = new StreamableHTTPServerTransport({
    eventStore: new InMemoryEventStore(),
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.streamable[sessionId] = transport;
    },
  });

  // Clean up transport when closed
  transport.onclose = () => {
    if (transport.sessionId) {
      delete transports[transport.sessionId];
    }
  };

  // Connect the MCP server to the transport
  await mcpServer.connect(transport);
  mcpServer.onerror = console.error.bind(console);
  agent.bindToMcpServer(mcpServer);

  return transport;
}

// POST handler for client-to-server communication
app.all("/mcp/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const sessionId = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.streamable[sessionId]) {
    transport = transports.streamable[sessionId];
  } else {
    transport = await createSessionTransport(req.auth as AuthInfo, id);
  }
  await transport.handleRequest(req, res, req.body);
});

app.all("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.streamable[sessionId]) {
    transport = transports.streamable[sessionId];
  } else {
    transport = await createSessionTransport(req.auth as AuthInfo);
  }
  await transport.handleRequest(req, res, req.body);
});

const port = parseInt(env.MCP_SERVER_PORT || "8080", 10);

app.listen(port, () => {
  console.log(`MCP Gateway Server running on http://localhost:${port}`);
});



async function bindToRegistry(agent: MCPClientManager, auth: AuthInfo, id?: string) {
  if (env.MCP_REGISTRY_URL) {
    const registry = new MCPClientConnection(new URL(env.MCP_REGISTRY_URL!), {
      id: id,
      info: {
        name: "mcp-gateway-server",
        version: "1.0.0",
      },
      transport: () =>
        new StreamableHTTPClientTransport(new URL(env.MCP_REGISTRY_URL!), {
          requestInit: {
            headers: {
              Authorization: `Bearer ${auth.token}`,
            },
          },
        }),
    });
    await registry.init();
    await agent.updateFromRegistry(registry);
    registry.connectionState.subscribe((state) => {
      console.log("registry connection state", state);
      if (state === "ready") {
        agent.updateFromRegistry(registry);
      }
      if (state === "failed") {
        console.error("registry connection failed", registry.error);
      } else {
        console.log("registry connection state", state);
      }
    });
  }
}
