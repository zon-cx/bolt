import logger from "../shared/Logger.js";
import type { mcpConfig } from "./mcp.types.js";
import { McpServer } from "./McpServer.js";
import type { Tool } from "./Tool.js";

/**
 * Manages MCP servers connections and tool execution.
 */
export class McpClient {
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
