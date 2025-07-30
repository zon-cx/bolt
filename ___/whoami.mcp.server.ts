import express from "express";
import { randomUUID } from "node:crypto";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import { Server  } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { env } from "node:process";
// import {gigyaOAuthProvider, gigyaOAuthRouter, requireAuth} from "./gateway.mcp.auth";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import {authRouter, protectedResourcesRouter, requireAuth} from "@/registry.mcp.server.auth.ts";
const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>
};

const getServer =  ()=>{
  const server = new McpServer({
    name: 'WhoAmI',
    version: '0.0.0',
  });
  server.tool('whoami', ({ sessionId,authInfo }) => {
    console.log("authInfo", authInfo);
    return {
      content: [
        { type: 'text', text: JSON.stringify(authInfo ?? { error: 'Not authenticated' }) },
      ],
    };
  });
  
  return server;
}

 
app.use(authRouter);
app.use(protectedResourcesRouter)
// app.use("/:id",gigyaOAuthRouter);
app.all("/mcp", requireAuth,async (req,res)=>{
  async function createTransport() {

    const server = getServer()

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.streamable[sessionId] = transport;
      },
    });

    await server.connect(transport);
    return transport;
  }
  const transport = transports.streamable[req.header("mcp-session-id") as string] || await createTransport();
  await transport.handleRequest(req, res, req.body);
} )

// Legacy SSE endpoint for older clients
app.get('/sse', async (req, res) => {
  // Create SSE transport for legacy clients
  const transport = new SSEServerTransport('/messages', res);
  transports.sse[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports.sse[transport.sessionId];
  });
  
  await getServer().connect(transport);
});

// Legacy message endpoint for older clients
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.sse[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});


// Health check
app.get("/healthz", (req, res) => {
  res.send("OK");
});

const port = parseInt(env.PORT || "8080", 10);
app.listen(port, () => {
  console.log(`MCP Gateway Server running on http://localhost:${port}`);
});