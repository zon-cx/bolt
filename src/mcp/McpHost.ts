import logger from "../shared/logger.js";
import type { mcpConfig } from "./mcp.types.js";
import { McpClient } from "./McpClient.js";
import type { Tool } from "./Tool.js";

/**
 * Manages MCP clients and tool execution.
 */
export class McpHost {
    private _clients: Record<string, McpClient> = {};
    private _tools: Record<string, { mcpClient: McpClient; tool: Tool }> = {}; // Indexed by clientName-toolName
    constructor(mcpConfig: mcpConfig) {
        Object.entries(mcpConfig.mcpClients).forEach(([name, config]) => {
            this._clients[name] = new McpClient(name, config);
        });
    }

    async initialize() {
        try {
            await Promise.all(Object.values(this._clients).map((client) => client.initialize()));
            Object.entries(this._clients).forEach(([name, client]) => {
                Object.entries(client.getTools()).forEach(([toolName, tool]) => {
                    this._tools[name + "-" + toolName] = { mcpClient: client, tool };
                });
            });
            logger.info("MCP client initialized, available tools :");
            Object.entries(this._tools).forEach(([key, value]) => {
                logger.info(`---> ${key}: ${JSON.stringify(value.tool)}`);
            });
        } catch (error) {
            logger.error("Error initializing MCP client: " + error);
            throw error;
        }
    }

    getTools(): Tool[] {
        return Object.values(this._tools).map((tool) => tool.tool);
    }

    /**
     * Execute a tool from a specific client.
     * @param toolName Name of the tool to execute in format client.toolName
     * @param toolArgs Tool arguments
     * @returns Tool execution result
     * @throws Error if tool not found or execution fails
     */
    async executeTool(toolName: string, toolArgs: Record<string, any>): Promise<any> {
        if (!this._tools[toolName]) {
            throw new Error(`Tool ${toolName} not found`);
        }

        const tool = this._tools[toolName];
        try {
            const result = await tool.mcpClient.executeTool(tool.tool.name, toolArgs);
            return result;
        } catch (e) {
            logger.warn(`Error executing tool: ${e}.`);
            throw e;
        }
    }
}
