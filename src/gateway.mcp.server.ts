import express, {RequestHandler} from "express";
import { randomUUID } from "node:crypto";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import { Server  } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, CompatibilityCallToolResultSchema, CompleteRequestSchema, Prompt, ResourceTemplateSchema } from "@modelcontextprotocol/sdk/types.js";
import { getOrCreateMcpAgent } from "./gateway.mcp.connection.store";
import { env } from "node:process";
import { Subscription } from "@xstate/store";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { MCPClientManager } from "./gateway.mcp.connection";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>
};



const GIGYA_ISSUER =
    "https://gigya.authz.id/oidc/op/v1.0/4_yCXuvQ52Ux52BdaQTxUVhg";

const proxyProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: `${GIGYA_ISSUER}/authorize`,
    tokenUrl: `${GIGYA_ISSUER}/token`,
    registrationUrl: `${GIGYA_ISSUER}/register`,
    revocationUrl: `${GIGYA_ISSUER}/revoke`, // optional, if supported by Gigya
  },

  verifyAccessToken: async (token) => {
    console.log("verifyAccessToken", token);
    const response = await fetch(`${GIGYA_ISSUER}/userinfo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },

    });

    if (!response.ok) {
      console.error("token_verification_failed", Object.fromEntries(response.headers.entries()));
      throw new Error('token_verification_failed');
    }

    const userInfo = await response.json();

    if (typeof userInfo !== 'object' || userInfo === null || !('sub' in userInfo)) {
      throw new Error('invalid_token');
    }

    return {
      issuer: GIGYA_ISSUER,
      subject: String(userInfo.sub), // 'sub' is a standard claim for the subject (user's ID)
      scopes: ["openid", "profile", "email"],
      claims: userInfo,
      token,
      clientId: "FYEcmQ4aAAZ-i69s1UZSxJ8x", // Client ID is not used in this example, but can be set if needed
    };
  },
  getClient: async (client_id) => {
    return {
      scope: "openid profile email",
      client_id,
      redirect_uris: ["http://localhost:3000/callback", "http://localhost:6274/oauth/callback/debug", "http://localhost:6274/oauth/callback", "http://localhost:8080/oauth/callback", "http://localhost:8090/oauth/callback", `${env.BASE_URL || "http://localhost:8080"}/oauth/callback`, `${env.BASE_URL || "http://localhost:8080"}/oauth/callback/debug`],
    }
  }
})
app.use(mcpAuthRouter({
  provider: proxyProvider,
  issuerUrl: new URL("https://mcp-auth.val.run"),
  baseUrl: new URL( "https://mcp-auth.val.run"),
  serviceDocumentationUrl: new URL("https://docs.example.com/"),
}))
export const requireAuth = requireBearerAuth({
  verifier: proxyProvider,
  requiredScopes: ["openid", "profile", "email"],
});


// Create the MCP agent (aggregates multiple MCP clients)
const agent = getOrCreateMcpAgent("default");
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

function getId(extra: RequestHandlerExtra<any,any>): string {
  const id = extra?.authInfo?.extra?.subject as string || extra.sessionId || "default";
  console.log("agent id", id, extra?.authInfo?.extra);
  return id;
}

// Helper to create a new MCP server and transport for a session
async function createSessionTransport(agent: MCPClientManager) {
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
  // Register handlers to proxy requests to the agent
  mcpServer.setRequestHandler(ListToolsRequestSchema, async (request,extra) => ({
    tools: getOrCreateMcpAgent(getId(extra),mcpServer).listTools(),
  }));
  mcpServer.setRequestHandler(ListPromptsRequestSchema, async (_,extra) => ({
    prompts: getOrCreateMcpAgent(getId(extra),mcpServer).listPrompts(),
  }));
  mcpServer.setRequestHandler(ListResourcesRequestSchema, async (_,extra) => ({
    resources:  getOrCreateMcpAgent(getId(extra),mcpServer).listResources(),
  }));
  mcpServer.setRequestHandler(ListResourceTemplatesRequestSchema, async (_, extra) => ({
    resourceTemplates:  getOrCreateMcpAgent(getId(extra),mcpServer).listResourceTemplates(),
  }));
  mcpServer.setRequestHandler(GetPromptRequestSchema, async (request,extra) => {
    return  getOrCreateMcpAgent(getId(extra),mcpServer).getPrompt(request.params);
  });
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request,extra) => {
    return  getOrCreateMcpAgent(getId(extra),mcpServer).callTool(request.params);
  });
  mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request,extra) => {
    return  getOrCreateMcpAgent(getId(extra),mcpServer).readResource(request.params);
  });
  mcpServer.setRequestHandler(CompleteRequestSchema, async (request,extra) => {
    return  getOrCreateMcpAgent(getId(extra),mcpServer).complete(request.params);
  });

  // const subscriptions: Subscription[] = [];
  // // Subscribe to tool changes and notify clients
  // subscriptions.push(agent.tools.subscribe(() => {
  //   if (agent.tools.get()) mcpServer.sendToolListChanged();
  // }));
  // subscriptions.push(agent.prompts.subscribe(() => {
  //   if (agent.prompts.get()) mcpServer.sendPromptListChanged();
  // }));
  // subscriptions.push(agent.resources.subscribe(() => {
  //   if (agent.resources.get()) mcpServer.sendResourceListChanged();
  // }));
  // subscriptions.push(agent.resourceTemplates.subscribe(() => {
  //   if (agent.resourceTemplates.get()) mcpServer.sendResourceListChanged();
  // }));

  const transport = new StreamableHTTPServerTransport({
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
app.all("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.header("mcp-session-id") as string | undefined;
  let transport: StreamableHTTPServerTransport;
  
  if (sessionId && transports.streamable[sessionId]) {
    transport = transports.streamable[sessionId];
  } else {

    transport = await createSessionTransport( );
  }
  await transport.handleRequest(req, res, req.body);
  // No need to use toFetchResponse here since handleRequest works with Node req/res
});


const port = parseInt(env.MCP_SERVER_PORT || "8080", 10);

app.listen(port  , () => {
  console.log(`MCP Gateway Server running on http://localhost:${port}`);
});