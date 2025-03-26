import Bot from "./slack/Bot.js";
import { McpClient } from "./mcp/McpClient.js";
import logger from "./shared/Logger.js";
import { loadConfig } from "./mcp/mcpServerConfig.js";

const mcpConfig = loadConfig("mcp.json");
const mcpClient = new McpClient(mcpConfig);
await mcpClient.initialize();
const bot = new Bot(mcpClient);

(async () => {
    try {
        await bot.start();
        logger.info("⚡️Slack MCP Bot is running");
    } catch (error) {
        logger.error("unable to start slack mcp bot", error);
    }
})();
