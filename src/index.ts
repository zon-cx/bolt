import SlackMcpBot from "./SlackMcpBot.js";
import { MCPClient } from "./McpClient.js";
import logger from "./Logger.js";
import { loadConfig } from "./serverConfig.js";

const mcpConfig = loadConfig("mcp.json");
const mcpClient = new MCPClient(mcpConfig);
await mcpClient.initialize();
const bot = new SlackMcpBot(mcpClient);

(async () => {
    try {
        await bot.start();
        logger.info("⚡️Slack MCP Bot is running");
    } catch (error) {
        logger.error("unable to start slack mcp bot", error);
    }
})();
