import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import z from "zod";
import logger from "./Logger.js";
import type { mcpServerConfig, mcpConfig } from "./serverConfig.js";

const McpToolProperty = z.object({
    type: z.string(),
    description: z.string().default(""),
});

const McpToolSchema = z.object({
    type: z.string(),
    properties: z.record(z.string(), McpToolProperty),
    required: z.array(z.string()).default([]),
});

const McpTool = z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: McpToolSchema,
});

const McpTools = z.record(z.string(), McpTool);
const McpToolsArray = z.array(McpTool);

type mcpTools = z.infer<typeof McpTools>;
type mcpTool = z.infer<typeof McpTool>;
type mcpToolProperty = z.infer<typeof McpToolProperty>;
type mcpToolSchema = z.infer<typeof McpToolSchema>;

export class McpServer {
    private name: string;
    private config: mcpServerConfig;
    private transport: SSEClientTransport | StdioClientTransport | null;
    private client: Client | null;
    private tools: Record<string, Tool> = {};
    constructor(name: string, config: mcpServerConfig) {
        this.name = name;
        this.config = config;
        this.transport = null;
        this.client = null;
    }

    async initialize() {
        try {
            logger.info("Connecting to MCP server " + this.name + " with config: " + JSON.stringify(this.config));
            if ("url" in this.config) {
                this.transport = new SSEClientTransport(new URL(this.config.url));
            } else if ("command" in this.config) {
                this.transport = new StdioClientTransport({
                    command: this.config.command,
                    args: this.config.args,
                });
            }
            this.client = new Client(
                {
                    name: this.name,
                    version: "1.0.0",
                },
                {
                    capabilities: {
                        prompts: {},
                        resources: {},
                        tools: {},
                    },
                },
            );
            await this.client.connect(this.transport as Transport);
            const mcpTools = await this.listTools();
            Object.entries(mcpTools).forEach(([name, tool]) => {
                this.tools[name] = new Tool(tool, this.name);
            });
            logger.info("Connected to MCP Server " + this.name);
        } catch (error) {
            logger.error("Error connecting to server " + this.name + ": " + error);
        }
    }

    private async listTools(): Promise<mcpTools> {
        if (!this.client) {
            throw new Error(`Cannot list tools for ${this.name} because server is not initialized`);
        }
        try {
            const serverTools = (await this.client.listTools()).tools;
            const mcpToolsArray = McpToolsArray.parse(serverTools);
            const tools = Object.fromEntries(mcpToolsArray.map((tool) => [tool.name, tool]));
            return tools;
        } catch (error) {
            logger.error("Error listing tools for " + this.name + ": " + error);
            return {};
        }
    }

    getTools(): Record<string, Tool> {
        return this.tools;
    }

    /**
     * Execute a tool in this server.
     * @param toolName Name of the tool to execute in format server.toolName
     * @param toolArgs Tool arguments
     * @returns Tool execution result
     * @throws Error if server is not initialized or tool execution fails
     */
    async executeTool(toolName: string, toolArgs: Record<string, any>) {
        if (!this.client) {
            throw new Error(`Server ${this.name} not initialized`);
        }

        const result = await this.client.callTool({
            name: toolName,
            arguments: toolArgs,
        });
        return result;
    }
}

/**
 * Manages MCP servers connections and tool execution.
 */
export class MCPClient {
    private servers: Record<string, McpServer> = {};
    private tools: Record<string, { mcpServer: McpServer; tool: Tool }> = {}; // Indexed by server.toolName
    constructor(mcpConfig: mcpConfig) {
        Object.entries(mcpConfig.mcpServers).forEach(([name, config]) => {
            this.servers[name] = new McpServer(name, config);
        });
    }

    async initialize() {
        try {
            await Promise.all(Object.values(this.servers).map((server) => server.initialize()));
            Object.entries(this.servers).forEach(([name, server]) => {
                Object.entries(server.getTools()).forEach(([toolName, tool]) => {
                    this.tools[name + "." + toolName] = { mcpServer: server, tool };
                });
            });
            logger.info("MCP client initialized, available tools :");
            Object.entries(this.tools).forEach(([key, value]) => {
                logger.info(`---> ${key}: ${JSON.stringify(value.tool)}`);
            });
        } catch (error) {
            logger.error("Error initializing MCP client: " + error);
            throw error;
        }
    }

    getTools(): Tool[] {
        return Object.values(this.tools).map((tool) => tool.tool);
    }

    /**
     * Execute a tool from a specific server.
     * @param toolName Name of the tool to execute in format server.toolName
     * @param toolArgs Tool arguments
     * @returns Tool execution result
     * @throws Error if tool not found or execution fails
     */
    async executeTool(toolName: string, toolArgs: Record<string, any>): Promise<any> {
        if (!this.tools[toolName]) {
            throw new Error(`Tool ${toolName} not found`);
        }

        const tool = this.tools[toolName];
        try {
            const result = await tool.mcpServer.executeTool(tool.tool.name, toolArgs);
            return result;
        } catch (e) {
            logger.warn(`Error executing tool: ${e}.`);
            throw e;
        }
    }
}

export class Tool {
    public serverName: string;
    public name: string;
    public description: string;
    public inputSchema: mcpToolSchema;

    constructor(mcpTool: mcpTool, serverName: string) {
        this.name = mcpTool.name;
        this.description = mcpTool.description;
        this.inputSchema = mcpTool.inputSchema;
        this.serverName = serverName;
    }

    formatForLLM(): string {
        /**
         * Format tool information for LLM.
         *
         * @returns A formatted string describing the tool.
         */
        const argsDescriptions: string[] = [];
        Object.entries(this.inputSchema.properties).forEach(([name, property]) => {
            let argDescription = `- ${name}: `;
            if (this.inputSchema.required?.includes(name)) {
                argDescription += "REQUIRED - ";
            }
            argDescription += "type: " + property.type + " - " + property.description;
            argsDescriptions.push(argDescription);
        });

        const formattedTool = `
            Tool: ${this.serverName}.${this.name}
            Description: ${this.description}
            Arguments:
            ${argsDescriptions.join("\n")}`;

        return formattedTool;
    }
}
