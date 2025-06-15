import express, {RequestHandler} from "express";
import { randomUUID } from "node:crypto";
import { Server  } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, CompatibilityCallToolResultSchema, CompleteRequestSchema, Prompt, ResourceTemplateSchema } from "@modelcontextprotocol/sdk/types.js";
import { MCPAgentManager } from "./registry.identity.store";
import { env } from "node:process";
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';

 import { authRouter, getAuthId, requireAuth } from "./registry.mcp.server.auth";
const app = express();
app.use(express.json());
app.use(authRouter);
// Map to store transports by session ID
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>
};

 


 app.use(async (req, res, next) => {
    console.log(`[LOG] ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('Body:', req.body);
    }
    res.on('finish', () => {
        console.log(`[LOG] ${req.method} ${req.url} ${res.statusCode}`);
      });
  
    await next();
    console.log(`[LOG] [DONE] ${req.method} ${req.url} ${res.statusCode}`);
  });



// Helper to create a new MCP server and transport for a session
async function createSessionTransport(getId = getAuthId) {
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
  const mcpAgentManager = new MCPAgentManager(mcpServer);
  // Register handlers to proxy requests to the agent
  mcpServer.setRequestHandler(ListToolsRequestSchema, async (request,extra) => ({
    tools: mcpAgentManager.initAgent(getId(extra)).listTools(),
  }));
  mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_,extra) => ({
    prompts: mcpAgentManager.initAgent(getId(extra)).listPrompts(),
  }));
  mcpServer.setRequestHandler(ListResourcesRequestSchema, async (_,extra) => ({
    resources: mcpAgentManager.initAgent(getId(extra)).listResources(),
  }));
  mcpServer.setRequestHandler(ListResourceTemplatesRequestSchema, async (_, extra) => ({
    resourceTemplates: mcpAgentManager.initAgent(getId(extra)).listResourceTemplates(),
  }));
  mcpServer.setRequestHandler(GetPromptRequestSchema, async (request,extra) => {
    return  mcpAgentManager.initAgent(getId(extra)).getPrompt(request.params);
  });
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request,extra) => {
    return  mcpAgentManager.initAgent(getId(extra)).callTool(request.params);
  });
  mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request,extra) => {
    return  mcpAgentManager.initAgent(getId(extra)).readResource(request.params);
  });
  mcpServer.setRequestHandler(CompleteRequestSchema, async (request,extra) => {
    return  mcpAgentManager.initAgent(getId(extra)).complete(request.params);
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
    // subscriptions.forEach((subscription) => subscription.unsubscribe());
  };

  // Connect the MCP server to the transport
  await mcpServer.connect(transport);
  mcpServer.onerror = console.error.bind(console);

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
    transport = await createSessionTransport(()=>id);
  }
  await transport.handleRequest(req, res, req.body);
});


app.all("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;
  
  if (sessionId && transports.streamable[sessionId]) {
    transport = transports.streamable[sessionId];
  } else {

    transport = await createSessionTransport( );
  }
  await transport.handleRequest(req, res, req.body);
});



const port = parseInt(env.MCP_SERVER_PORT || "8080", 10);

app.listen(port  , () => {
  console.log(`MCP Gateway Server running on http://localhost:${port}`);
});