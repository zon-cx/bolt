import logger from "../shared/logger.js";
import type { McpConfig } from "./mcp.types.js";
import { McpClient } from "./McpClient.js";
import type { Tool } from "./Tool.js";
import type { ToolCallRequest } from "../slack/actionRequestStore.js";

export type ToolCallResult = {
    success: boolean;
    toolResult: any;
};

/**
 * Manages MCP clients and tool execution.
 */
export class McpHost {
    private _clients: Record<string, McpClient> = {};
    // Todo : mcpHost might only need to map serverName-toolName to toolName ?
    private _tools: Record<string, { mcpClient: McpClient; tool: Tool }> = {}; // Indexed by serverName-toolName
    private _sessionId: string;
    constructor(mcpConfig: McpConfig, sessionId: string) {
        this._sessionId = sessionId;
        Object.entries(mcpConfig.mcpServers).forEach(([name, config]) => {
            this._clients[name] = new McpClient(name, config, this._sessionId);
        });
    }

    async initialize() {
        try {
            await Promise.all(Object.values(this._clients).map((client) => client.connect()));
            Object.entries(this._clients).forEach(([name, client]) => {
                if (client.isConnected()) {
                    Object.entries(client.tools).forEach(([toolName, tool]) => {
                        this._tools[name + "-" + toolName] = { mcpClient: client, tool };
                    });
                }
            });
            logger.info("MCP Host initialized, available tools :");
            Object.entries(this._tools).forEach(([key, value]) => {
                logger.info(`---> ${key}: ${JSON.stringify(value.tool)}`);
            });
        } catch (error) {
            logger.error("Error initializing MCP client: " + error);
            throw error;
        }
    }

    // TODO clean that
    get tools(): Tool[] {
        return Object.values(this._tools).map((tool) => tool.tool);
    }

    get clients(): Record<string, McpClient> {
        return this._clients;
    }

    async disconnect(serverName: string) {
        if (!this._clients[serverName]) {
            logger.warn(`Server ${serverName} not found`);
            return;
        }
        await this._clients[serverName].disconnect();
    }

    async connect(serverName: string) {
        if (!this._clients[serverName]) {
            logger.warn(`Server ${serverName} not found`);
            return;
        }
        try {
            await this._clients[serverName].connect();
        } catch (error) {
            logger.error(`Error connecting to server ${serverName}: ${error}`);
        }
    }

    /**
     * Execute a tool from a specific client.
     * @param toolName Name of the tool to execute in format client.toolName
     * @param toolArgs Tool arguments
     * @returns Tool execution result
     * @throws Error if tool not found or execution fails
     */
    async processToolCallRequest(toolCallRequest: ToolCallRequest): Promise<void> {
        const tool = this._tools[toolCallRequest.toolName];
        if (!tool) {
            throw new Error(`Tool ${toolCallRequest.toolName} not found`);
        }
        try {
            toolCallRequest.toolCallResult = await tool.mcpClient.executeTool(tool.tool.name, toolCallRequest.toolArgs);
            toolCallRequest.success = true;
        } catch (error) {
            logger.error(`Error executing tool ${toolCallRequest.toolName}: ${error}`);
            toolCallRequest.success = false;
        }
    }
}
