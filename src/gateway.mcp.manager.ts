import {z} from "zod";
import {getOrCreateMcpAgent} from "@/gateway.mcp.connection.store.ts";
import {randomUUID} from "node:crypto";
import {env} from "node:process";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import express from "express";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";


const app = express();
app.use(express.json());


async function createServerManager() {
    const mcpServer = new McpServer({
        name: "mcp-gateway-server",
        version: "1.0.0",
    }, {
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
    });
    
    mcpServer.resource("connections", "urn:mcp:connections",  { mimeType: "text/json" },  async (params, extra) => {
        const agentId = getId(extra);
        const agent = getOrCreateMcpAgent(agentId, mcpServer);
        const connections = await agent.listConnections();
        return {
            contents: [
                {
                    uri: "urn:mcp:connections",
                    text:   JSON.stringify(connections, null, 2),
                }
            ],
        }    
    })
         
    mcpServer.registerTool("list-connections", {
        outputSchema:
            {connections:z.array(z.object({
                    id: z.string(),
                    url: z.string(),
                    version: z.string().optional(),
                    name: z.string().optional(),
                    status: z.enum([ "ready", "authenticating", "connecting", "discovering", "failed", "disconnected", "connected" ]).optional(),
                }))},
        description: "List all available MCP servers",
    }, async function (  extra) {
        console.log("Listing MCP servers",   extra);  
        try {
            const agentId = getId(extra);
            const agent = getOrCreateMcpAgent(agentId, mcpServer);
            const connections = await agent.listConnections();
            await extra.sendNotification({
                method: "notifications/message",
                params: {
                    level: "info",
                    type: "text",
                    text: `Available ${connections.length} MCP servers for agent ${agentId}`,
                }
            });
            return {
                content: [{
                    type: "text",
                    text: `Available MCP servers for agent ${agentId}`,
                }],
                structuredContent:{
                   connections
                }

            }
        }
        catch (error) {
            console.error("Error listing MCP servers:", error);
            return {
                content: [{
                    type: "text",
                    text: `Error listing MCP servers: ${error.message}`,
                    isError: true,
                }],
            };
        }
    })

    mcpServer.registerTool("connect", {
        inputSchema: {
            url: z.string().url(),
            name: z.string().optional(),
            type: z.enum(["streamable"]).default("streamable"),
        },
        outputSchema: {
            name: z.string(),
            url: z.string(),
            version: z.string().optional(),
        },
        description: "Connect to a new MCP server",
    }, async function (params, extra) {
        const agentId = getId(extra);
        const agent = getOrCreateMcpAgent(agentId, mcpServer);
        const connection = await agent.connect(params.url, {
            id: params.name,
        })
       
        return {
            content: [{
                type: "text",
                text: `Connected to MCP server ${params.url} with id ${connection.id}`,
            }],
            structuredContent: {
                name: params.name || connection.id,
                url: params.url,
                version: connection.version,
            }
        }
    });
    mcpServer.registerTool("disconnect", {
            inputSchema: {
                id: z.string()
            },
            description: "Disconnect from an MCP server",
        }, async function (params, extra) {
            const agentId = getId(extra);
            const agent = getOrCreateMcpAgent(agentId, mcpServer);
            await agent.closeConnection(params.id);
            return {
                content: [{
                    type: "text",
                    text: `Disconnected from MCP server ${ params.id}`,
                }],

            }
        }
    );
    
    mcpServer.registerTool("get-connection-info", {
        inputSchema:{
            id: z.string()
        },
        outputSchema: {
            id: z.string(),
            url: z.string(),
            version: z.string().optional(),
        },
        description: "Get information about the MCP server",
    }, async function (params, extra) {
        const agentId = getId(extra);
        const agent = getOrCreateMcpAgent(agentId, mcpServer);
        const connection =  agent.mcpConnections[params.id] 
        if (!connection) {
            return {
                content: [{
                    type: "text",
                    text: `No MCP server found with id ${params.id}`,
                    isError: true,
                }],
            };
        }
        return {
            content: [{
                type: "text",
                text: `MCP server info for ${params.id}: ${connection.name} (${connection.url})`,
            }],
            structuredContent: {
                id: params.id,
                name: connection.name,
                url: connection.url,
                state: connection.connectionState.get(),    
                tools: connection.tools.get().length,
                prompts: connection.prompts.get().length,
                resources: connection.resources.get().length,
                resourceTemplates: connection.resourceTemplates.get().length,
                
            }
        }
    });
 
    const transport = new StreamableHTTPServerTransport({
        eventStore: new InMemoryEventStore(),
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
            transports.streamable[sessionId] = transport;
        },
    });

    transport.onclose = () => {
        if (transport.sessionId) {
            delete transports.streamable[transport.sessionId];
        }
    }
    transport.onerror = (error) => {
        console.error("Transport error:", error);
    }

    // Connect the MCP server to the transport
    await mcpServer.connect(transport);
    return transport;
}

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

app.all("/mcp", requireAuth, async (req, res) => {
    const sessionId = req.header("mcp-session-id") as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.streamable[sessionId]) {
        transport = transports.streamable[sessionId];
    } else {
        transport = await createServerManager( );
    }
    await transport.handleRequest(req, res, req.body);
});


const port = parseInt(env.MCP_SERVER_PORT || "8080", 10);

app.listen(port  , () => {
    console.log(`MCP Gateway Server running on http://localhost:${port}`);
});

function getId(extra: RequestHandlerExtra<any,any>): string {
    const id = extra?.authInfo?.extra?.subject as string || extra?.sessionId || "default";
    console.log("agent id", id, extra?.authInfo?.extra);
    return id;
}