import Bot from "./slack/Bot.js";
import { McpHost } from "./mcp/McpHost.js";
import logger from "./shared/logger.js";
import { loadConfig } from "./mcp/mcpClientConfig.js";

const mcpConfig = loadConfig("mcp.json");
const mcpHost = new McpHost(mcpConfig);
await mcpHost.initialize();
const bot = new Bot(mcpHost);

(async () => {
    try {
        await bot.start();
        logger.info("⚡️Slack MCP Bot is running");
    } catch (error) {
        logger.error("unable to start slack mcp bot", error);
    }
})();
