import {z} from "zod";
import {agentConfig, mcpAgentManager, serverConfig} from "@/registry.identity.store";
import {randomUUID} from "node:crypto";
import {env} from "node:process";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import express from "express";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { version } from "node:os";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {authRouter, requireAuth, getAgentAuthInfo, protectedResourcesRouter} from "./registry.mcp.server.auth";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { connectYjs } from "./store.yjs";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {OAuthTokensSchema} from "@modelcontextprotocol/sdk/shared/auth.js";
import { ServerConfig } from "./registry.mcp.client";
import { AuthSchema } from "./registry.mcp.client.auth";
import { memoryMonitor } from "./memory-monitor";
import * as Y from "yjs";
// Add cleanup tracking
const cleanupTimeouts = new Map<string, NodeJS.Timeout>();
const MAX_TRANSPORT_LIFETIME = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT_TRANSPORTS = 100;
const agents: Record<string, agentConfig> = {};
const agentStores: Record<string, Y.Map<ServerConfig>> = {};
const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>
};

const doc =  connectYjs("@mcp.registry");

 


 

const ServerSchema =z.object({
    id: z.string().describe("The id of the server").optional(),
    url: z.string().url().describe("The url of the server").optional(),
    name: z.string().describe("The name of the server").optional(),
    transport_type: z.enum(["streamable", "sse"]).default("streamable").describe("The transport type of the server").optional(),
    version: z.string().describe("The version of the server").optional(),
    type: z.enum(["streamable", "sse"]).describe("The transport type of the server").optional(),
    error: z.object({
        message: z.string(),
        code: z.string().optional(),
        stack: z.string().optional(),
    }).optional(),
    status: z.enum([ "ready", "authenticating", "connecting", "discovering", "failed", "disconnected", "connected" ,"initializing"]).optional(),
    auth: AuthSchema.optional(), 
}) .catchall(z.unknown())



const mcpServer = new McpServer({
    name: "mcp-manager",
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


mcpServer.resource(
    "server",
    new ResourceTemplate("urn:mcp:server/{id}", {
        list: async (extra) => {
            const store = agentStores[extra.sessionId || "default"] ;
            const servers = Array.from(store.entries()).map(([key, value]) => ({
                ...value,
                id: key
            }));
            return {
                resources: servers.map(server => ({
                    uri: `urn:mcp:server/${server.id}`,
                    name: server.name || server.id,
                    description: `MCP server at ${server.url}`,
                    mimeType: "application/json"
                }))
            };
        }
    }),
    {
        title: "MCP Server",
        description: "Dynamic MCP server resource by ID",
        mimeType: "application/json"
    },
    async (uri, params, extra) => {
        const store = agentStores[extra.sessionId || "default"] ;
        const serverId = String(params.id);
        const server = store.get(serverId);
        if (!server) {
            return {
                contents: [{
                    uri: uri.href,
                    text: JSON.stringify({ error: "Server not found" }, null, 2),
                    mimeType: "application/json"
                }]
            };
        }
        return {
            contents: [{
                uri: uri.href,
                text: JSON.stringify(server, null, 2),
                mimeType: "application/json"
            }]
        };
    }
);

mcpServer.registerTool("list", {
        outputSchema: {connections:z.array(ServerSchema)},
        description: "List all available MCP servers",
    },
    // @ts-ignore when no args, extra is first argument but typescript is not aware of that
    async function ( extra: RequestHandlerExtra<any,any>) {
        console.log("Listing MCP servers",  extra);
        const store = agentStores[extra.sessionId || "default"] ;
        const agent = agents[extra.sessionId || "default"]

        try {
            const connections = Array.from(store.entries()).map(([key, value]) => ({
                ...value,
                id: key,
            }));
            await extra.sendNotification({
                method: "notifications/message",
                params: {
                    level: "info",
                    type: "text",
                    text: `Available ${connections.length} MCP servers for agent ${agent?.name}`,
                }
            });
            return {
                content: [{
                    type: "text",
                    text: `Available MCP servers for agent ${agent?.name}`,
                }],
                structuredContent: {
                    connections
                }
            }
        }
        catch (error: unknown) {
            console.error("Error listing MCP servers:", error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                content: [{
                    type: "text",
                    text: `Error listing MCP servers: ${errorMessage}`,
                    isError: true,
                }],
            };
        }
    });

mcpServer.registerTool("connect", {
    inputSchema: {
        url: z.string().url(),
        name: z.string().optional(),
        transport_type: z.enum(["streamable", "sse"]).default("streamable"),
        auth_type: z.enum(["none", "passthrough", "bearer", "basic", "oauth2"]).default("passthrough"),
    },
    outputSchema: ServerSchema.shape,
    description: "Connect to a new MCP server with basic configuration",
}, async function (params, extra) {
    const store = agentStores[extra.sessionId || "default"] ;

    const existingConnection = store.get(params.name || params.url);
    const connection = store.set(params.name || params.url, {
        id: params.name || params.url,
        url: params.url,
        name: params.name || params.url,
        version: "1.0.0",
        type: params.transport_type || "streamable",
        auth:  {
            type: "passthrough",
            ...existingConnection?.auth,
            ...(params.auth_type ? {type: params.auth_type} : {}),
        }
    });

    return {
        structuredContent:connection,
        content: [{
            type: "text",
            text: `Connected to MCP server ${params.url} with id ${connection.id} using ${params.transport_type} transport`,
        }],
    }
});



mcpServer.registerTool("auth-settings", {
    inputSchema: {
        id: z.string(),
        type: z.enum(["none", "passthrough", "bearer", "basic", "oauth2"]).default("passthrough"),
        scopes: z.array(z.string()).optional(),
        inheritance: z.enum(["agent", "session"]).optional(),
    },
    outputSchema: ServerSchema.shape,
    description: "Update authentication settings for an MCP server connection",
}, async function (params, extra) {
    const store = agentStores[extra.sessionId || "default"] ;

    const connection = store.get(params.id);
    if (!connection) {
        return {
            content: [{
                type: "text",
                text: `No MCP server found with id ${params.id}`,
                isError: true,
            }],
        };
    }

    // Update auth settings
    const updatedConnection = store.set(params.id, {
        ...connection,
        auth: {
            ...connection.auth || {},
            type: params.type,
            scopes: params.scopes,
            inheritance: params.inheritance,
        }
    });

    return {
        content: [{
            type: "text",
            text: `Updated auth settings for MCP server ${params.id} to use ${params.type} authentication`,
        }],
        structuredContent:updatedConnection,
    }
});
mcpServer.registerTool("credentials", {
        inputSchema: {
            server: z.string().describe("The name of the server to update"),
            client_id: z.string().describe("The client id to use for the server"),
            client_secret: z.string().describe("The client secret to use for the server"),
        },
        outputSchema: ServerSchema.shape,
        description: "Update authentication credentials for an MCP server connection",
    }, async function (params, extra) {
    const store = agentStores[extra.sessionId || "default"] ;

    const connection = store.get(params.server);
        if (!connection) {
            return {
                content: [{
                    type: "text",
                    text: `No MCP server found  ${params.server}`,
                    isError: true,
                }],
            };
        }
        const updatedConnection = store.set(params.server, {
            ...connection,
            auth: {
                ...connection.auth || {},
                tokens: {
                    access_token: Buffer.from(`${params.client_id}:${params.client_secret}`).toString('base64'),
                    token_type: "Basic",
                }
            }
        });
        return {
            content: [{
                type: "text",
                text: `Updated authentication credentials for MCP server ${params.server}`,
            }],
            structuredContent:updatedConnection,
        }
    }
);

mcpServer.registerTool("auth", {
    inputSchema: {
        server: z.string().describe("The name of the server to update"),
        ...OAuthTokensSchema.shape,
    },
    outputSchema: ServerSchema.shape,
    description: "Update authentication tokens for an MCP server connection",
}, async function ({server, ...tokens}, extra) {
    const store = agentStores[extra.sessionId || "default"] ;

    const connection = store.get(server);
    if (!connection) {
        return {
            content: [{
                type: "text",
                text: `No MCP server found  ${server}`,
                isError: true,
            }],
        };
    }

    const updatedConnection = store.set(server, {
        ...connection,
        auth: {
            type: connection.auth?.type || "oauth2",
            ...connection.auth || {},
            tokens: tokens
        }
    });

    return {
        content: [{
            type: "text",
            text: `Updated authentication tokens for MCP server ${server}`,
        }],
        structuredContent:updatedConnection,
    }
});

mcpServer.registerTool("disconnect", {
        inputSchema: {
            id: z.string()
        },
        description: "Disconnect from an MCP server",
    }, async function (params, extra) {
    const store = agentStores[extra.sessionId || "default"] ;

    store.delete(params.id);
        return {
            content: [{
                type: "text",
                text: `Disconnected from MCP server ${ params.id}`,
            }],

        }
    }
);

mcpServer.registerTool("info", {
        outputSchema: {
            id: z.string(),
            url: z.string(),
            name: z.string().optional(),
            version: z.string().optional(),
            connections: z.number()
        },
        description: "Get information about the MCP server",
    },
    // @ts-ignore when no args, extra is first argument but typescript is not aware of that
    async function ( extra: RequestHandlerExtra<any,any>) {
        console.log("Getting agent info",  extra.authInfo);
        const store = agentStores[extra.sessionId || "default"] ;
        const agent = agents[extra.sessionId || "default"] 

        try {
            const connections = Array.from(store.entries()).map(([key, value]) => ({
                ...value,
                id: key,
            }));
            const agentInfo = store.get(agent.id);
            return {
                content: [{
                    type: "text",
                    text: `Agent info for ${agent.name} with ${connections.length} connections`,
                }],
                structuredContent: {
                    id: agent.id,
                    connections: connections.length,
                    name: agent.name,
                    url: `${env.MCP_GATEWAY_URL}/${agent.id}`,
                    version: "1.0.0"
                }
            }
        } catch (error: unknown) {
            console.error("Error getting agent info:", error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                content: [{
                    type: "text",
                    text: `Error getting agent info: ${errorMessage}`,
                    isError: true,
                }],
            };
        }
    });

mcpServer.registerTool("details", {
    inputSchema: {
        id: z.string()
    },
    outputSchema:    ServerSchema.shape,
    description: "Get information about a specific MCP connection",
}, async function (args: { [x: string]: any }, extra: RequestHandlerExtra<any,any>) {
    try {
        const store = agentStores[extra.sessionId || "default"] ;
        const connection = store.get(args.id);

        if (!connection) {
            console.warn(`No MCP server found with id ${args.id}`);
            return {
                content: [{
                    type: "text",
                    text: `No MCP server found with id ${args.id}`,
                    isError: true,
                }],
            };
        }



        console.log(`Retrieved connection info for ${args.id}:`, connection);

        return {
            content: [{
                type: "text",
                text: `MCP server info for ${args.id}: ${connection.name} (${connection.url})${connection.auth ? ` with ${connection.auth.type} auth` : ''}`,
            }],
            structuredContent: connection
        }
    } catch (error: unknown) {
        console.error(`Error getting connection info for ${args.id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
            content: [{
                type: "text",
                text: `Error getting connection info: ${errorMessage}`,
                isError: true,
            }],
        };
    }
});

async function connectSession(sessionId: string, {session, auth, id}: {
    session?: string;
    auth: AuthInfo;
    id?: string;
}, transport: StreamableHTTPServerTransport): Promise<void> {
    const agent = mcpAgentManager.init({session, auth, id});
    const store = doc.getMap<ServerConfig>(agent.id);
    const connectionCallback = () => {
        mcpServer.sendResourceListChanged()
    }

    store.observe(connectionCallback)

    agentStores[sessionId] = store;
    agents[sessionId] = agent;

    // Connect the MCP server to the transport
    await mcpServer.connect(transport);
    // Clean up transport when closed
    transport.onclose = () => {
        console.log(`Transport for session ${sessionId} closed`);
        store.unobserve(connectionCallback);
        delete transports.streamable[sessionId];
        delete agentStores[sessionId];
        delete agents[sessionId];

        // Clear any existing cleanup timeout
        if (cleanupTimeouts.has(sessionId)) {
            clearTimeout(cleanupTimeouts.get(sessionId)!);
            cleanupTimeouts.delete(sessionId);
        }

    }
}


 

const app = express();
app.use(express.json()); 
app.use(authRouter);
app.use(protectedResourcesRouter);

// Add error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error handling request:', err);
    res.status(500).json({ error: 'Internal server error' });
});


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

const port = parseInt(env.PORT || "8080", 10);

const httpServer =app.listen(port  , (error?: Error) => {
    console.log(`MCP Registry Server running on ${JSON.stringify(httpServer.address()?.toString() || "{}")}`, error );
});
