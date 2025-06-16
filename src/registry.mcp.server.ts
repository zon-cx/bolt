import {z} from "zod";
import {agentConfig, MCPAgentManager} from "@/registry.identity.store";
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
import { authRouter, requireAuth } from "./registry.mcp.server.auth";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

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
        const sessionId = req.header("mcp-session-id") as string | undefined;
        
        // Check if we're at the transport limit
        if (!sessionId && getActiveTransportCount() >= MAX_CONCURRENT_TRANSPORTS) {
            console.warn('Maximum concurrent transports reached');
            res.status(503).json({ error: 'Server is at maximum capacity' });
            return;
        }

        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports.streamable[sessionId]) {
            transport = transports.streamable[sessionId];
            // Reset cleanup timeout
            if (cleanupTimeouts.has(sessionId)) {
                clearTimeout(cleanupTimeouts.get(sessionId));
            }
        } else {
            transport = await createServerManager(req.auth as AuthInfo);
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
        const sessionId = req.header("mcp-session-id") as string | undefined;
        const id = req.params.id;
        
        // Check if we're at the transport limit
        if (!sessionId && getActiveTransportCount() >= MAX_CONCURRENT_TRANSPORTS) {
            console.warn('Maximum concurrent transports reached');
            res.status(503).json({ error: 'Server is at maximum capacity' });
            return;
        }

        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports.streamable[sessionId]) {
            transport = transports.streamable[sessionId];
            // Reset cleanup timeout
            if (cleanupTimeouts.has(sessionId)) {
                clearTimeout(cleanupTimeouts.get(sessionId));
            }
        } else {
            transport = await createServerManager(req.auth as AuthInfo, id);
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

const port = parseInt(env.MCP_SERVER_PORT || "8080", 10);

app.listen(port  , () => {
    console.log(`MCP Gateway Server running on http://localhost:${port}`);
});

async function createServerManager(auth: AuthInfo, id?: string) {
    const agentInfo = (extra?: RequestHandlerExtra<any,any>): Partial<agentConfig> & {id: string} | string => {
        if(id) return id;
        const agentId = extra?.authInfo?.extra?.sub as string;
        return {id: agentId, name: extra?.authInfo?.extra?.name as string};
    }
    const mcpAgentManager = new MCPAgentManager(auth);
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

    mcpServer.resource("connections", "urn:mcp:connections",  { mimeType: "text/json" },  async (params, extra) => {
        const agent =  mcpAgentManager.initAgent(agentInfo(extra));
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
    },
    // @ts-ignore when no args, extra is first argument but typescript is not aware of that
    async function ( extra: RequestHandlerExtra<any,any>) {
        console.log("Listing MCP servers",  extra);
        try {
            const agent = mcpAgentManager.initAgent(agentInfo( extra ));
            const connections = await agent.listConnections();
            await extra.sendNotification({
                method: "notifications/message",
                params: {
                    level: "info",
                    type: "text",
                    text: `Available ${connections.length} MCP servers for agent ${agent.name}`,
                }
            });
            return {
                content: [{
                    type: "text",
                    text: `Available MCP servers for agent ${agent.name}`,
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
            type: z.enum(["streamable"]).default("streamable"),
        },
        outputSchema: {
            name: z.string(),
            url: z.string(),
            version: z.string().optional(),
        },
        description: "Connect to a new MCP server",
    }, async function (params, extra) {
        const agent = await mcpAgentManager.initAgent(agentInfo(extra));
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
            const agent =  mcpAgentManager.initAgent(agentInfo(extra));
            await agent.closeConnection(params.id);
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
        console.log("Getting agent info",  extra);
        try {
            const agent = mcpAgentManager.initAgent(agentInfo( extra ));
            const connections = await agent.listConnections();
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
                    version: agent.version
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

    mcpServer.registerTool("connection-info", {
        inputSchema: {
            id: z.string()
        },
        outputSchema: {
            id: z.string(),
            url: z.string(),
            version: z.string().optional(),
            name: z.string().optional(),
            state: z.string().optional(),
            tools: z.number().optional(),
            prompts: z.number().optional(),
            resources: z.number().optional(),
            resourceTemplates: z.number().optional()
        },
        description: "Get information about a specific MCP connection",
    }, async function (args: { [x: string]: any }, extra: RequestHandlerExtra<any,any>) {
        try {
            const agent = mcpAgentManager.initAgent(agentInfo(extra));
            const connection = agent.mcpConnections[args.id];
            
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

            const connectionInfo = {
                id: args.id,
                name: connection.name,
                url: connection.url,
                state: connection.connectionState.get(),
                tools: connection.tools.get().length,
                prompts: connection.prompts.get().length,
                resources: connection.resources.get().length,
                resourceTemplates: connection.resourceTemplates.get().length,
            };

            console.log(`Retrieved connection info for ${args.id}:`, connectionInfo);

            return {
                content: [{
                    type: "text",
                    text: `MCP server info for ${args.id}: ${connection.name} (${connection.url})`,
                }],
                structuredContent: connectionInfo
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
        sessionIdGenerator: () => randomUUID(),
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
    }

    transport.onerror = (error) => {
        console.error("Transport error:", error);
        if (transport.sessionId) {
            cleanupTransport(transport.sessionId);
        }
    }

    // Connect the MCP server to the transport
    await mcpServer.connect(transport);
    return transport;
}

const ListConnectionsResultSchema = CallToolResultSchema.extend({
    connections: z.array(
      z.object({
        name: z.string(),
        url: z.string(),
        status: z.string(),
      })
    ),
  });