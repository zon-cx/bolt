import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpClientConfig, McpTools } from "./mcp.types.js";
import { McpToolsArray } from "./mcp.types.js";
import logger from "../shared/logger.js";
import { Tool } from "./Tool.js";

export class McpClient {
    private _config: McpClientConfig;
    private _transport: SSEClientTransport | StdioClientTransport | null;
    private _client: Client;
    private _connected: boolean = false;
    private _sessionId: string;

    public serverName: string;
    public tools: Record<string, Tool> = {};

    constructor(serverName: string, config: McpClientConfig, sessionId: string) {
        this.serverName = serverName;
        this._config = config;
        this._sessionId = sessionId;
        this._transport = null;
        this._client = new Client(
            {
                name: this.serverName,
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
        this._connected = false;
    }

    get clientId(): string {
        return this._sessionId + "_" + this.serverName;
    }

    async connect() {
        if (this._connected) {
            logger.warn("MCP client " + this.serverName + " is already connected");
            return;
        }
        try {
            logger.info(
                "Connecting to MCP server " + this.serverName + " with config: " + JSON.stringify(this._config),
            );
            if ("url" in this._config && this._config.url.endsWith("/sse")) {
                this._transport = new SSEClientTransport(new URL(this._config.url));
            } else if ("command" in this._config) {
                this._transport = new StdioClientTransport({
                    command: this._config.command,
                    args: this._config.args,
                });
            }
            await this._client.connect(this._transport as Transport);
            const mcpTools = await this._listTools();
            this._connected = true;
            Object.entries(mcpTools).forEach(([toolName, tool]) => {
                this.tools[toolName] = new Tool(tool, this.serverName);
            });
            logger.info("Connected to MCP Server " + this.serverName);
        } catch (error) {
            logger.error("Error connecting to server " + this.serverName + ": " + error);
            throw error;
        }
    }

    async disconnect() {
        if (!this._client) {
            throw new Error(`Cannot disconnect from ${this.serverName} because server is not initialized`);
        }
        await this._client.close();
        this._connected = false;
    }

    private async _listTools(): Promise<McpTools> {
        try {
            const clientTools = (await this._client.listTools()).tools;
            const mcpToolsArray = McpToolsArray.parse(clientTools);
            const tools = Object.fromEntries(mcpToolsArray.map((tool) => [tool.name, tool]));
            return tools;
        } catch (error) {
            logger.error("Error listing tools for " + this.serverName + ": " + error);
            return {};
        }
    }

    isConnected(): boolean {
        return this._connected;
    }

    async executeTool(toolName: string, toolArgs: Record<string, any>): Promise<any> {
        try {
            const result = await this._client.callTool({
                name: toolName,
                arguments: toolArgs,
            });
            return result;
        } catch (error) {
            // TODO: define error types
            logger.error("Error executing tool " + toolName + " for " + this.serverName + ": " + error);
            throw error;
        }
    }
}
