import { randomUUID } from "node:crypto";
import {   Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {  CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, CompatibilityCallToolResultSchema, CompleteRequestSchema, Prompt, ResourceTemplateSchema } from "@modelcontextprotocol/sdk/types.js";
import { getOrCreateMcpAgent } from "./gateway.mcp.connection.store";
import { env } from "node:process";
import { Subscription } from "@xstate/store";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { MCPClientManager } from "./gateway.mcp.connection";

// const app = express();
// app.use(express.json());
const app = new Hono();
// Unwrap Hono errors to see original error details
app.onError((err, c) => {
  console.error("Hono error:", err);
  return c.json({
    error: String(err),
    stack: err.stack,
  }, 500);
});


// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Create the MCP agent (aggregates multiple MCP clients)
const agent = getOrCreateMcpAgent("default");

 
// Helper to create a new MCP server and transport for a session
async function createSessionTransport(agent: MCPClientManager) {
  const mcpServer = new McpServer(
    {
      name: "mcp-gateway-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        prompts: {
          listChanged:true,
        },
        resources: {
          listChanged:true,
          subscribe:true,
        },
        tools: {
          listChanged:true,
         },
         completions: {

         },
         logging: {
           
         },
         

      },
    
    }
  );

  

  // Register handlers to proxy requests to the agent
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: agent.listTools(),
  }));
  mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: agent.listPrompts(),
  }));
  mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: agent.listResources(),
  }));
  mcpServer.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: agent.listResourceTemplates(),
  }));
  mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return agent.getPrompt(request.params);
  });
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    return agent.callTool(request.params);
  });
  mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return agent.readResource(request.params);
  });
  
  mcpServer.setRequestHandler(CompleteRequestSchema, async (request) => {
    return agent.complete(request.params);
  });

  const subscriptions:Subscription[]= [] ;
  // Subscribe to tool changes and notify clients
  subscriptions.push(agent.tools.subscribe(() => {
    if (agent.tools.get()) mcpServer.sendToolListChanged();
  }));

  subscriptions.push(agent.prompts.subscribe(() => {
    if (agent.prompts.get()) mcpServer.sendPromptListChanged();
  }));
  subscriptions.push(agent.resources.subscribe(() => {
    if (agent.resources.get()) mcpServer.sendResourceListChanged();
  }));
  subscriptions.push(agent.resourceTemplates.subscribe(() => {
    if (agent.resourceTemplates.get()) mcpServer.sendResourceListChanged();
  }));
  
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports[sessionId] = transport;
    }
  });

  // Clean up transport when closed
  transport.onclose = () => {
    if (transport.sessionId) {
      delete transports[transport.sessionId];
    }
    subscriptions.forEach((subscription) => subscription.unsubscribe());
  };

  // Connect the MCP server to the transport
   await mcpServer.connect(transport);
   mcpServer.onerror = console.error.bind(console);

  return transport;
}

app.use("*", async (c, next)=>{
  try {
    return await next();
  } catch (err) {
    console.error(err);
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      },
      { status: 500 }
    );
  }
});
// POST handler for client-to-server communication
app.post('/:id', async (c) => {
  const { req, res } = toReqRes(c.req.raw);

  const sessionId = c.req.header('mcp-session-id') as string | undefined;
  let transport: StreamableHTTPServerTransport;
  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else  {
    transport = await createSessionTransport(agent);
  } 

  await transport.handleRequest(req, res, await c.req.json());
  return toFetchResponse(res);
});


// app.post("/:id", async (c) => {
//   const { id } = c.req.param();
//   const { req, res } = toReqRes(c.req.raw);
//   const sessionId = c.req.header('mcp-session-id') as string | undefined;
//   let transport: StreamableHTTPServerTransport;
//   if (sessionId && transports[sessionId]) {
//     transport = transports[sessionId];
//   } else  {
//     transport = await createSessionTransport(getOrCreateMcpAgent(id));
//   }  
//   await transport.handleRequest(req, res, await c.req.json());
// })

 
// GET for server-to-client notifications via SSE
app.get("/:id", async (c) => {
  console.log("Received GET MCP request");
  return c.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    },
    { status: 405 }
  );
});

app.delete("/:id", async (c) => {
  console.log("Received DELETE MCP request");
  return c.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    },
    { status: 405 }
  );
});


// Health check
app.get('/healthz', (c) => { return c.text('OK'); });

// const port = parseInt(env.PORT || "8080", 10);
// console.log(`MCP Gateway Server running on http://localhost:${port}`);
// app.listen(port);
serve({
  fetch: app.fetch,
  // createServer,
  port: parseInt(env.PORT || "8080", 10),
});
// export default app;

// createServer(
//   async (req, res) => {
//     const sessionId = req.headers['mcp-session-id'] as string | undefined;
//     if (!sessionId || !transports[sessionId]) {
//       return res.writeHead(400).end('Invalid or missing session ID');
//     }
//     const transport = transports[sessionId];
//     await transport.handleRequest(req, res);
  
//   }
// )