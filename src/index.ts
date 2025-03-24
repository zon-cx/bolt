import SlackMcpBot from "./SlackMcpBot.js";
import { MCPClient } from "./McpClient.js";

const mcpClient = new MCPClient("mcp", { url: "http://localhost:3001/sse" });
await mcpClient.initialize();
const bot = new SlackMcpBot(mcpClient);

(async () => {
    try {
        await bot.start();
        bot.app.logger.info("⚡️Slack MCP Bot is running");
    } catch (error) {
        bot.app.logger.error("unable to start slack mcp bot", error);
    }
})();
