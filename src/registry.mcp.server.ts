import {z} from "zod";
import type {agentConfig,serverConfig} from "@/registry.identity.store";
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
import { authRouter, requireAuth, getAgentAuthInfo } from "./registry.mcp.server.auth";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { connectYjs } from "./store.yjs";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

// Add cleanup tracking
const cleanupTimeouts = new Map<string, NodeJS.Timeout>();
const MAX_TRANSPORT_LIFETIME = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT_TRANSPORTS = 100;

const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>
};

// Add cleanup function
function cleanupTransport(sessionId: string) {
    console.log(`Cleaning up transport for session ${sessionId}`);
    if (transports.streamable[sessionId]) {
        const transport = transports.streamable[sessionId];
        transport.close();
        delete transports.streamable[sessionId];
    }
    if (cleanupTimeouts.has(sessionId)) {
        clearTimeout(cleanupTimeouts.get(sessionId));
        cleanupTimeouts.delete(sessionId);
    }
}

// Add transport count tracking
function getActiveTransportCount(): number {
    return Object.keys(transports.streamable).length;
}

const doc =  connectYjs("@mcp.registry");

const agentsStore = doc.getMap<agentConfig>("agents");



const app = express();
app.use(express.json());

app.use(authRouter);

// Add error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error handling request:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.all("/mcp", requireAuth, async (req, res, next) => {
    try {
        const session = req.header("mcp-session-id") as string | undefined;
        
        // Check if we're at the transport limit
        if (!session && getActiveTransportCount() >= MAX_CONCURRENT_TRANSPORTS) {
            console.warn('Maximum concurrent transports reached');
            res.status(503).json({ error: 'Server is at maximum capacity' });
            return;
        }

        let transport: StreamableHTTPServerTransport;

        if (session && transports.streamable[session]) {
            transport = transports.streamable[session];
            // Reset cleanup timeout
            if (cleanupTimeouts.has(session)) {
                clearTimeout(cleanupTimeouts.get(session));
            }
        } else {
            transport = await createServerManager( {auth:req.auth as AuthInfo, session} );
        }

        // Set cleanup timeout
        if (transport.sessionId) {
            const timeout = setTimeout(() => {
                cleanupTransport(transport.sessionId!);
            }, MAX_TRANSPORT_LIFETIME);
            cleanupTimeouts.set(transport.sessionId, timeout);
        }

        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.all("/mcp/:id", requireAuth, async (req, res, next) => {
    try {
        const session = req.header("mcp-session-id") as string | undefined;
        const id = req.params.id;
        
        // Check if we're at the transport limit
        if (!session && getActiveTransportCount() >= MAX_CONCURRENT_TRANSPORTS) {
            console.warn('Maximum concurrent transports reached');
            res.status(503).json({ error: 'Server is at maximum capacity' });
            return;
        }

        let transport: StreamableHTTPServerTransport;

        if (session && transports.streamable[session]) {
            transport = transports.streamable[session];
            // Reset cleanup timeout
            if (cleanupTimeouts.has(session)) {
                clearTimeout(cleanupTimeouts.get(session));
            }
        } else {
            transport = await createServerManager( {auth:req.auth as AuthInfo, session, id} );
        }

        // Set cleanup timeout
        if (transport.sessionId) {
            const timeout = setTimeout(() => {
                cleanupTransport(transport.sessionId!);
            }, MAX_TRANSPORT_LIFETIME);
            cleanupTimeouts.set(transport.sessionId, timeout);
        }

        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const port = parseInt(env.PORT || "8080", 10);

app.listen(port  , () => {
    console.log(`MCP Gateway Server running on http://localhost:${port}`);
});

async function createServerManager( {session, auth, id}:{session?: string, auth: AuthInfo, id?: string}): Promise<StreamableHTTPServerTransport> {
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

    const agentId = id || (auth?.extra?.sub as string) || "default";
    const agent = agentsStore.set(agentId, {
        id:agentId,
        name: (auth?.extra?.name as string) || agentId,
        created: new Date().toISOString(),
      ... agentsStore.get(agentId) || {}
    });
    
    const store = doc.getMap<serverConfig>(agentId)
     const connectionCallback = () => {
        mcpServer.sendResourceListChanged()
    }
    
    store.observe(connectionCallback)
    
    mcpServer.resource(
        "server",
        new ResourceTemplate("urn:mcp:server/{id}", { 
            list: async () => {
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
        async (uri, params) => {
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
        outputSchema:
            {connections:z.array(z.object({
                    id: z.string(),
                    url: z.string(),
                    version: z.string().optional(),
                    name: z.string().optional(),
                    error: z.object({
                        message: z.string(),
                        code: z.number().optional(),
                        stack: z.string().optional(),
                    }).optional(),
                    type: z.enum(["streamable", "sse", "stdio"]).optional(),
                    status: z.enum([ "ready", "authenticating", "connecting", "discovering", "failed", "disconnected", "connected" ]).optional(),
                }))},
        description: "List all available MCP servers",
    },
    // @ts-ignore when no args, extra is first argument but typescript is not aware of that
    async function ( extra: RequestHandlerExtra<any,any>) {
        console.log("Listing MCP servers",  extra);
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
            type: z.enum(["streamable", "sse"]).default("streamable"),
        },
        outputSchema: {
            name: z.string(),
            url: z.string(),
            version: z.string().optional(),
            type: z.enum(["streamable", "sse"]).optional(),
            error: z.object({
                message: z.string(),
                code: z.string().optional(),
                stack: z.string().optional(),
            }).optional(),
            status: z.enum([ "ready", "authenticating", "connecting", "discovering", "failed", "disconnected", "connected" ,"initializing"]).optional(),
        },
        description: "Connect to a new MCP server",
    }, async function (params, extra) { 
         const connection = store.set(params.name || params.url, {
            id: params.name || params.url,
            url: params.url,
            name: params.name || params.url,
            version: "1.0.0",
            type: params.type || "streamable",
        });
         
        return {
            content: [{
                type: "text",
                text: `Connected to MCP server ${params.url} with id ${connection.id} using ${params.type} transport`,
            }],
            structuredContent: {
                name: params.name || connection.id,
                url: params.url,
                version: connection.version,
                type: params.type,
            }
        }
    });

    mcpServer.registerTool("disconnect", {
            inputSchema: {
                id: z.string()
            },
            description: "Disconnect from an MCP server",
        }, async function (params, extra) {
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
        outputSchema: {
            id: z.string(),
            url: z.string(),
            version: z.string().optional(),
            name: z.string().optional(),
            status: z.enum([ "ready", "authenticating", "connecting", "discovering", "failed", "disconnected", "connected" ,"initializing"]).optional(),
            error: z.object({
                message: z.string(),
                code: z.string().optional(),
                stack: z.string().optional(),
            }).optional(),
            tools: z.number().optional(),
            prompts: z.number().optional(),
            resources: z.number().optional(),
            resourceTemplates: z.number().optional()
        },
        description: "Get information about a specific MCP connection",
    }, async function (args: { [x: string]: any }, extra: RequestHandlerExtra<any,any>) {
        try {
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
                    text: `MCP server info for ${args.id}: ${connection.name} (${connection.url})`,
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

    const transport = new StreamableHTTPServerTransport({
        eventStore: new InMemoryEventStore(),
        sessionIdGenerator: () => session || randomUUID(),
        onsessioninitialized: (sessionId) => {
            console.log(`Initializing transport for session ${sessionId}`);
            transports.streamable[sessionId] = transport;
        },
    });

    transport.onclose = () => {
        if (transport.sessionId) {
            console.log(`Transport closed for session ${transport.sessionId}`);
            cleanupTransport(transport.sessionId);
        }
        store.unobserve(connectionCallback)
    }

    transport.onerror = (error) => {
        console.error("Transport error:", error);
        if (transport.sessionId) {
            cleanupTransport(transport.sessionId);
        }
        store.unobserve(connectionCallback)
    }

    // Connect the MCP server to the transport
    await mcpServer.connect(transport);
    return transport;
}

export const ListConnectionsResultSchema = CallToolResultSchema.extend({
    connections:z.array(z.object({
        id: z.string(),
        url: z.string(),
        version: z.string().optional(),
        name: z.string().optional(),
        error: z.object({
            message: z.string(),
            code: z.number().optional(),
            stack: z.string().optional(),
        }).optional(),
        status: z.enum([ "ready", "authenticating", "connecting", "discovering", "failed", "disconnected", "connected" ]).optional(),
    })),
  });