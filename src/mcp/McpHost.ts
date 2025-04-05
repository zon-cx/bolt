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
    private _userId: string;
    constructor(mcpConfig: McpConfig, userId: string) {
        this._userId = userId;
        Object.entries(mcpConfig.mcpServers).forEach(([name, config]) => {
            this._clients[name] = new McpClient(name, config, this._userId);
        });
    }

    // TODO clean that
    get tools(): Tool[] {
        return Object.values(this._tools).map((tool) => tool.tool);
    }

    get clients(): Record<string, McpClient> {
        return this._clients;
    }

    getClientByServerUrl(serverUrl: string): McpClient | undefined {
        return Object.values(this._clients).find((client) => client.serverUrl === serverUrl);
    }

    async disconnect(serverName: string) {
        if (!this._clients[serverName]) {
            logger.warn(`Server ${serverName} not found`);
            return;
        }
        await this._clients[serverName].disconnect();
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
