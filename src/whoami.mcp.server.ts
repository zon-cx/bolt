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