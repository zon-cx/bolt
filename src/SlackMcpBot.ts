import type { ChatCompletionMessageParam, ChatCompletionSystemMessageParam } from "openai/resources/chat/completions";
import bolt from "@slack/bolt";
import MCPClient from "./McpClient.js";
import Tool from "./Tools.js";
import { getOrThrow } from "./utils.js";

import { threadStarted, userMessage } from "./Listeners.js";

class SlackMCPBot {
    public app: bolt.App;
    // public mcpClient: MCPClient;
    public tools: Tool[] = [];
    // public assistant: bolt.Assistant;
    constructor() {
        this.app = new bolt.App({
            token: getOrThrow("SLACK_BOT_TOKEN"),
            appToken: getOrThrow("SLACK_APP_TOKEN"),
            signingSecret: getOrThrow("SLACK_SIGNING_SECRET"),
            logLevel: bolt.LogLevel.INFO,
            socketMode: true,
        });
    }

    async start() {
        const assistant = new bolt.Assistant({
            threadStarted,
            userMessage,
        });

        this.app.assistant(assistant);
        await this.app.start(process.env.PORT || 3000);
    }
}

export default SlackMCPBot;
