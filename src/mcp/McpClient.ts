import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { mcpClientConfig } from "./mcp.types.js";
import type { mcpTools } from "./mcp.types.js";
import { McpToolsArray } from "./mcp.types.js";
import logger from "../shared/logger.js";
import { Tool } from "./Tool.js";

export class McpClient {
    private name: string;
    private config: mcpClientConfig;
    private transport: SSEClientTransport | StdioClientTransport | null;
    private client: Client | null;
    private tools: Record<string, Tool> = {};
    constructor(name: string, config: mcpClientConfig) {
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
            const mcpTools = await this._listTools();
            Object.entries(mcpTools).forEach(([name, tool]) => {
                this.tools[name] = new Tool(tool, this.name);
            });
            logger.info("Connected to MCP Server " + this.name);
        } catch (error) {
            logger.error("Error connecting to server " + this.name + ": " + error);
        }
    }

    private async _listTools(): Promise<mcpTools> {
        if (!this.client) {
            throw new Error(`Cannot list tools for ${this.name} because server is not initialized`);
        }
        try {
            const clientTools = (await this.client.listTools()).tools;
            const mcpToolsArray = McpToolsArray.parse(clientTools);
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
