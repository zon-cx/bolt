import Bot from "./slack/Bot.js";
import logger from "./shared/logger.js";

const bot = new Bot();

(async () => {
    try {
        await bot.start();
        logger.info("⚡️Slack MCP Bot is running");
    } catch (error) {
        logger.error("unable to start slack mcp bot", error);
    }
})();
