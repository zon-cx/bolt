import bolt, {
    type AssistantThreadStartedMiddleware,
    type AssistantUserMessageMiddleware,
    type SayArguments,
} from "@slack/bolt";
import { getOrThrow } from "../shared/utils.js";
import { McpClient } from "../mcp/McpClient.js";
import type { Tool } from "../mcp/Tool.js";
import type { ConversationsRepliesResponse } from "@slack/web-api";
import { llmClient } from "../llm/LlmClient.js";
import type { ChatCompletionMessageParam, ChatCompletionSystemMessageParam } from "openai/resources/chat/completions";
import logger from "../shared/Logger.js";
import { formatToolList } from "./utils.js";

interface toolCallParams {
    toolname: string;
    toolArgs: Record<string, any>;
}

interface toolCallResult extends toolCallParams {
    success: boolean;
    toolResult: any;
}

export class Bot {
    public app: bolt.App;
    public mcpClient: McpClient;
    public tools: Tool[];
    constructor(mcpClient: McpClient) {
        this.app = new bolt.App({
            token: getOrThrow("SLACK_BOT_TOKEN"),
            appToken: getOrThrow("SLACK_APP_TOKEN"),
            signingSecret: getOrThrow("SLACK_SIGNING_SECRET"),
            logLevel: bolt.LogLevel.INFO,
            socketMode: true,
        });
        this.mcpClient = mcpClient;
        this.tools = [];
    }

    async start() {
        this.tools = this.mcpClient.getTools();
        const assistant = new bolt.Assistant({
            threadStarted: this.threadStarted,
            userMessage: this.userMessage,
        });

        this.app.assistant(assistant);
        await this.app.start(process.env.PORT || 3000);
    }

    threadStarted: AssistantThreadStartedMiddleware = async ({ event, say }) => {
        try {
            await say(formatToolList(this.tools));
        } catch (e) {
            logger.error(e);
        }
    };

    userMessage: AssistantUserMessageMiddleware = async ({ client, message, say }) => {
        if (!message.subtype) {
            // This means it's a message from the user
            if (!message.thread_ts) {
                logger.info("No thread ts on im message");
                return;
            }

            // Get the thread history and prepare it for the LLM with the system message
            const { channel, thread_ts } = message;
            const conversationReplies = await client.conversations.replies({
                channel: channel,
                ts: thread_ts,
            });
            const chatCompletionMessages = Bot.toChatCompletionMessages(conversationReplies, this.tools);

            // Get the LLM response
            let llmResponse = "";
            try {
                llmResponse = await llmClient.getResponse(chatCompletionMessages);
                logger.debug("1st llm response: - " + llmResponse);
            } catch (e) {
                logger.error(e);
                try {
                    await say("I'm sorry, something went wrong. Please try again in a little while.");
                } catch (e) {
                    logger.error(e);
                }
            }

            // Handle tool calls
            if (llmResponse.startsWith("[TOOL]")) {
                const { success, toolname, toolArgs, toolResult } = await this.processToolCall(llmResponse);
                if (!success) {
                    try {
                        await say("I'm sorry, something went wrong. Please try again in a little while.");
                    } catch (e) {
                        logger.error(e);
                    }
                    return;
                }
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
                logger.debug("Tool call interpretation: - " + interpretation);
                try {
                    await say({ text: interpretation });
                } catch (e) {
                    logger.error(e);
                }
            } else {
                try {
                    await say({ text: llmResponse });
                } catch (e) {
                    logger.error(e);
                }
            }
        }
    };

    async processToolCall(llmResponse: string): Promise<toolCallResult> {
        const toolCallResult: toolCallResult = {
            success: false,
            toolname: "",
            toolArgs: {},
            toolResult: undefined,
        };
        try {
            const toolCallParams = Bot.extractToolCallParams(llmResponse);
            toolCallResult.toolname = toolCallParams.toolname;
            toolCallResult.toolArgs = toolCallParams.toolArgs;
        } catch (e) {
            logger.error("Error extracting tool call params: " + e);
            return toolCallResult;
        }
        logger.debug(
            "Executing tool call: " +
                toolCallResult.toolname +
                " - with args: " +
                JSON.stringify(toolCallResult.toolArgs),
        );
        try {
            toolCallResult.toolResult = await this.mcpClient.executeTool(
                toolCallResult.toolname,
                toolCallResult.toolArgs,
            );
            toolCallResult.success = true;
        } catch (e) {
            logger.error("Error executing tool call: " + toolCallResult.toolname + " - " + e);
            toolCallResult.success = false;
        }
        return toolCallResult;
    }

    static extractToolCallParams(llmResponse: string): toolCallParams {
        const toolCallParams: toolCallParams = {
            toolname: "",
            toolArgs: {},
        };

        if (!llmResponse.startsWith("[TOOL]")) {
            throw new Error("Tool call with wrong format in llm response: " + llmResponse);
        }
        const parts = llmResponse.split("[TOOL]");
        if (parts.length < 2) {
            throw new Error("Tool call with wrong format in llm response: " + llmResponse);
        }
        const toolParts = parts[1]!.trim().split("\n", 2);
        toolCallParams.toolname = toolParts[0]!.trim();
        if (toolParts.length < 2) {
            throw new Error("Tool call with wrong format in llm response: " + llmResponse);
        }
        toolCallParams.toolArgs = JSON.parse(toolParts[1]!.trim());
        return toolCallParams;
    }

    static toChatCompletionMessages(
        conversationReplies: ConversationsRepliesResponse,
        tools: Tool[],
    ): ChatCompletionMessageParam[] {
        if (!conversationReplies.messages) {
            return [];
        }

        const systemMessage = Bot.getSystemMessage(tools);
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

    static getSystemMessage(tools: Tool[]) {
        const currentDateTime = new Date().toLocaleString();
        const toolsString = tools.map((tool) => tool.formatForLLM()).join("\n");
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
        return systemMessage;
    }
}

export default Bot;
