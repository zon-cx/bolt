import {z} from "zod";
import {agentConfig, mcpAgentManager} from "@/registry.identity.store";
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

const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>
};

const app = express();
app.use(express.json());

app.use(authRouter)

// Map to store transports by session ID




 
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

app.all("/mcp/:id", requireAuth, async (req, res) => {
    const sessionId = req.header("mcp-session-id") as string | undefined;
    const id = req.params.id;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.streamable[sessionId]) {
        transport = transports.streamable[sessionId];
    } else {
        transport = await createServerManager( id);
    }
    await transport.handleRequest(req, res, req.body);
});


const port = parseInt(env.MCP_SERVER_PORT || "8080", 10);

app.listen(port  , () => {
    console.log(`MCP Gateway Server running on http://localhost:${port}`);
});



async function createServerManager(id?: string) {
    const agentInfo = (extra?: RequestHandlerExtra<any,any>): Partial<agentConfig> & {id: string} | string => {
        if(id) return  id;
        const agentId =  extra?.authInfo?.extra?.sub as string
        return {id: agentId, name: extra?.authInfo?.extra?.name as string};
    }
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
    }, async function (  extra) {
        console.log("Listing MCP servers",   extra);
        try {
            const agent =  mcpAgentManager.initAgent(agentInfo(extra));
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
            connections:z.number()
        },
        description: "Get information about the MCP server",
    }, async function ( extra) {
        const agent =  mcpAgentManager.initAgent(agentInfo(extra));
        const connections = await agent.listConnections();
        return {
            content: [{
                type: "text",
                text: `Agent info for ${agent.name}  with ${connections.length} connections )`,
            }],
            structuredContent: {
                id: agent.id,
                connections: connections.length,
                name: agent.name,
                url: `${env.MCP_GATEWAY_URL}/${agent.id}`,
                version:agent.version
            }
        }
    });

    mcpServer.registerTool("connection-info", {
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
        const agent =  mcpAgentManager.initAgent(agentInfo(extra));
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

const ListConnectionsResultSchema = CallToolResultSchema.extend({
    connections: z.array(
      z.object({
        name: z.string(),
        url: z.string(),
        status: z.string(),
      })
    ),
  });