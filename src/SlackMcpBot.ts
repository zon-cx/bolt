import bolt, { type AssistantThreadStartedMiddleware, type AssistantUserMessageMiddleware } from "@slack/bolt";
import Tool from "./Tools.js";
import { getOrThrow } from "./utils.js";
import { MCPClient } from "./McpClient.js";
import type { ConversationsRepliesResponse } from "@slack/web-api";
import { llmClient } from "./LlmClient.js";
import type { ChatCompletionMessageParam, ChatCompletionSystemMessageParam } from "openai/resources/chat/completions";

class SlackMcpBot {
    public app: bolt.App;
    public tools: Tool[] = [];
    public mcpClient: MCPClient;
    constructor(mcpClient: MCPClient) {
        this.app = new bolt.App({
            token: getOrThrow("SLACK_BOT_TOKEN"),
            appToken: getOrThrow("SLACK_APP_TOKEN"),
            signingSecret: getOrThrow("SLACK_SIGNING_SECRET"),
            logLevel: bolt.LogLevel.INFO,
            socketMode: true,
        });
        this.mcpClient = mcpClient;
    }

    async start() {
        this.tools = await this.mcpClient.listTools();
        const assistant = new bolt.Assistant({
            threadStarted: this.threadStarted,
            userMessage: this.userMessage,
        });

        this.app.assistant(assistant);
        await this.app.start(process.env.PORT || 3000);
    }

    threadStarted: AssistantThreadStartedMiddleware = async ({ event, logger, say }) => {
        try {
            await say("Hi, how can I help? 🏴‍☠️");
        } catch (e) {
            logger.error(e);
        }
    };

    userMessage: AssistantUserMessageMiddleware = async ({ client, logger, message, say }) => {
        if (!message.subtype) {
            if (!message.thread_ts) {
                logger.info("No thread ts on im message");
                return;
            }
            const { channel, thread_ts } = message;
            const conversationReplies = await client.conversations.replies({
                channel: channel,
                ts: thread_ts,
            });
            const chatCompletionMessages = this.convertConversationRepliesToChatCompletionMessages(
                conversationReplies,
                this.tools,
            );

            let llmResponse = await llmClient.getResponse(chatCompletionMessages);
            console.log("LLM RESPONSE", llmResponse);
            if (llmResponse.startsWith("[TOOL]")) {
                const { toolname, toolArgs, toolResult } = await this.processToolCall(llmResponse);
                chatCompletionMessages.push({
                    role: "system",
                    content: `
You are a helpful assistant. You've just used a tool and received results. Interpret these results for the user in a clear, helpful way.`,
                });
                chatCompletionMessages.push({
                    role: "user",
                    content: `I used the tool ${toolname} with arguments "${toolArgs}" and got this result:\n\n${toolResult.content[0].text}\n\nPlease interpret this result for me.`,
                });
                const interpretation = await llmClient.getResponse(chatCompletionMessages);
                try {
                    await say({ text: interpretation });
                } catch (e) {
                    logger.error(e);
                }
            }
        }
    };

    async processToolCall(llmResponse: string) {
        if (!llmResponse.startsWith("[TOOL]")) {
            return {
                toolname: "",
                toolArgs: "",
                toolResult: `I tried to use a tool but the request was incomplete. Here's my response without the tool:
${llmResponse.split("[TOOL]")[0]}`,
            };
        }
        const parts = llmResponse.split("[TOOL]");
        if (parts.length < 2) {
            return {
                toolname: "",
                toolArgs: "",
                toolResult: `I tried to use a tool but the request was incomplete. Here's my response without the tool:
${parts[0]}`,
            };
        }
        const toolParts = parts[1]!.trim().split("\n", 2);
        const toolName = toolParts[0]!.trim();
        if (toolParts.length < 2) {
            return {
                toolname: toolName,
                toolArgs: "",
                toolResult: `I tried to use the tool ${toolName} but the request was incomplete. Here's my response without the tool:
${llmResponse.split("[TOOL]")[0]}`,
            };
        }
        const toolArgs = JSON.parse(toolParts[1]!.trim());
        const toolResult = await this.mcpClient.executeTool(toolName, toolArgs);
        return { toolname: toolName, toolArgs: toolArgs, toolResult: toolResult };
    }

    convertConversationRepliesToChatCompletionMessages(
        conversationReplies: ConversationsRepliesResponse,
        tools: Tool[],
    ): ChatCompletionMessageParam[] {
        if (!conversationReplies.messages) {
            return [];
        }
        const currentDateTime = new Date().toLocaleString();
        const toolsString = tools.map((tool) => tool.formatForLLM()).join("\n");
        console.log("TOOLS STRING", toolsString);
        const systemMessage: ChatCompletionSystemMessageParam = {
            role: "system",
            content: `
#### CONTEXT
Nous sommes le ${currentDateTime}.
You are a friendly assistant that can help answer questions and help with tasks. 
You can use the following tools:
${toolsString}
When you need to use a tool, you MUST format your response exactly like this:
[TOOL] tool_name
{"param1": "value1", "param2": "value2"}

Make sure to include both the tool name AND the JSON arguments.
Never leave out the JSON arguments.

After receiving tool results, interpret them for the user in a helpful way.
      `,
        };
        const chatCompletionMessages = conversationReplies.messages
            .filter((message) => (message as any).subtype === undefined)
            .map((message) => {
                return {
                    role: message.bot_id ? "assistant" : "user",
                    content: message.text || "",
                } as ChatCompletionMessageParam;
            });
        chatCompletionMessages.unshift(systemMessage);
        return chatCompletionMessages;
    }
}

export default SlackMcpBot;
