import express from 'express';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {env} from "node:process";

const app = express();

const proxyProvider = new ProxyOAuthServerProvider({
    endpoints: {
        authorizationUrl: "https://auth.external.com/oauth2/v1/authorize",
        tokenUrl: "https://auth.external.com/oauth2/v1/token",
        revocationUrl: "https://auth.external.com/oauth2/v1/revoke",
    },
    verifyAccessToken: async (token) => {
        return {
            token,
            clientId: "123",
            scopes: ["openid", "email", "profile"],
        }
    },
    getClient: async (client_id) => {
        return {
            client_id,
            redirect_uris: ["http://localhost:3000/callback"],
        }
    }
})

// app.use(mcpAuthRouter({
//     provider: proxyProvider,
//     issuerUrl: new URL("https://auth.external.com"),
//     baseUrl: new URL("https://mcp.example.com"),
//     serviceDocumentationUrl: new URL("https://docs.example.com/"),
// }))

// Middleware to log requests
app.use(async (req, res, next) => {
    console.log(`[LOG] ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Body:', req.body);
    }
    res.on('finish', () => {
        console.log(`[LOG] ${req.method} ${req.url} ${res.statusCode}`);
    });
    try {
        await next()
    }
    catch(err) {
        console.error(`[ERROR] ${req.method} ${req.url} - ${err.message}`);
        res.status(500).send('Internal Server Error');
    }
});

const getServer =  ()=>{
    const server = new McpServer({
        name: 'WhoAmI',
        version: '0.0.0',
    });
    server.tool('whoami', ({ sessionId,authInfo }) => {
        console.log("authInfo", authInfo, sessionId);
        return {
            content: [
                { type: 'text', text: JSON.stringify(authInfo ?? { error: 'Not authenticated' }) },
            ],
        };
    });

    return server;
}

 
app.get('/', (req, res) => {
    res.send('MCP Auth Server is running');
});

app.post('/mcp', async (req, res) => {
    // In stateless mode, create a new instance of transport and server for each request
    // to ensure complete isolation. A single instance would cause request ID collisions
    // when multiple clients connect concurrently.

    try {
        const server = getServer();
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        res.on('close', () => {
            console.log('Request closed');
            transport.close();
            server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});

  

const port = parseInt(env.PORT || "8080", 10);
app.listen(port, () => {
    console.log(`MCP Gateway Server running on http://localhost:${port}`);
});