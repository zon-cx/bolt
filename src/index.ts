import SlackMCPBot from "./SlackMcpBot.js";

const bot = new SlackMCPBot();

(async () => {
    try {
        await bot.start();
        bot.app.logger.info("⚡️Slack MCP Bot is running");
    } catch (error) {
        bot.app.logger.error("unable to start slack mcp bot", error);
    }
})();
