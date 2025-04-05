import Bot from "./slack/Bot.js";
import logger from "./shared/logger.js";
import express from "express";
import authRoutes from "./express/authRoutes.js";
import { getConfig } from "./shared/utils.js";

const bot = new Bot();

(async () => {
    try {
        await bot.start();
        logger.info("⚡️Slack MCP Bot is running");
    } catch (error) {
        logger.error("unable to start slack mcp bot", error);
    }
})();

const app = express();

app.use(express.json());
app.use("/auth", authRoutes);

app.listen(getConfig("PORT", 3000), () => {
    logger.info(`Server running on port ${getConfig("PORT", 3000)}`);
});
