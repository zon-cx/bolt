import bolt, { type AssistantThreadStartedMiddleware, type AssistantUserMessageMiddleware } from "@slack/bolt";
import { getOrThrow } from "../shared/utils.js";
import { McpClient } from "../mcp/McpClient.js";
import type { Tool } from "../mcp/Tool.js";
import type { ConversationsRepliesResponse } from "@slack/web-api";
import { llmClient } from "../llm/LlmClient.js";
import type {
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import logger from "../shared/logger.js";
import { formatWelcomeMessage, buildApprovalButtons, buildMarkdownSection } from "./utils.js";
import { OrderedFixedSizeMap } from "../shared/OrderedFixedSizeMap.js";
import { stableHash } from "stable-hash";

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
    private toolCallCache: OrderedFixedSizeMap<string, toolCallParams[]>;
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
        this.toolCallCache = new OrderedFixedSizeMap<string, toolCallParams[]>(50);
    }

    async start() {
        this.tools = this.mcpClient.getTools();
        const assistant = new bolt.Assistant({
            threadStarted: this.threadStarted,
            userMessage: this.userMessage,
        });

        this.app.assistant(assistant);
        this.app.action("approve_tool_call", this.proceedWithToolCallAction);
        this.app.action("cancel_tool_call", this.cancelToolCallAction);
        await this.app.start(process.env.PORT || 3000);
    }

    cancelToolCallAction = async ({
        payload,
        body,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        ack();
        const toolCallParams = this.toolCallCache.getAndDelete(payload.value || "");
        await respond({
            text: "Ok, I'm not going to use that tool. What else can I do for you?",
        });
    };

    proceedWithToolCallAction = async ({
        payload,
        body,
        action,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        ack();
        const toolCallParams = this.toolCallCache.getAndDelete(payload.value || "");
        if (!toolCallParams) {
            logger.error("Tool call params not found in cache");
            await say({ text: "Sorry something went wrong. Please try again.", thread_ts: body.container.thread_ts });
            return;
        }
        await respond({ text: "Ok, I'm working on it..." });
        const toolCallResults = await Promise.all(toolCallParams.map(this.processToolCall.bind(this)));
        if (!toolCallResults.every((toolCallResult) => toolCallResult.success)) {
            await say({ text: "Sorry something went wrong. Please try again.", thread_ts: body.container.thread_ts });
            return;
        }
        const chatCompletionMessages: ChatCompletionMessageParam[] = [];
        chatCompletionMessages.push({
            role: "system",
            content: `
            You are a helpful assistant. You've just used a tool and received results. Interpret these results for the user in a clear, helpful way. Please format your response as markdown.`,
        });
        let toolCallResultsMessages = "I used the tools:\n";
        toolCallResultsMessages += toolCallResults.map((toolCallResult) => {
            return `- ${toolCallResult.toolname} with arguments "${toolCallResult.toolArgs}" and got this result:\n${toolCallResult.toolResult.content[0].text}\n`;
        });
        toolCallResultsMessages += "\n\nPlease interpret these results for me.";
        chatCompletionMessages.push({
            role: "user",
            content: toolCallResultsMessages,
        });
        const interpretation = await llmClient.getResponse(chatCompletionMessages, this.tools);
        logger.debug("Tool call interpretation: - " + interpretation?.content);
        await say({
            blocks: [buildMarkdownSection(interpretation?.content || "...")],
            thread_ts: body.container.thread_ts,
        });
    };

    threadStarted: AssistantThreadStartedMiddleware = async ({ event, say }) => {
        try {
            await say(formatWelcomeMessage(this.tools));
        } catch (e) {
            logger.error(e);
        }
    };

    userMessage: AssistantUserMessageMiddleware = async ({ client, message, say }) => {
        try {
            const { isInThread, message: messageInThread } = Bot.isMessageInThread(message);
            if (!isInThread) {
                return;
            }

            // Get the last 5 messages in the thread and prepare it for the LLM with the system message
            const { channel, thread_ts } = messageInThread;
            const conversationReplies = await client.conversations.replies({
                channel: channel,
                ts: thread_ts!,
                limit: 5,
            });
            const chatCompletionMessages = Bot.toChatCompletionMessages(conversationReplies);
            chatCompletionMessages.unshift(Bot.getSystemMessage(this.tools));

            const llmResponse = await llmClient.getResponse(chatCompletionMessages, this.tools);

            // Handle tool calls
            if (llmResponse?.tool_calls && llmResponse.tool_calls.length > 0) {
                const toolRequests = llmResponse.tool_calls.map((toolCall) => {
                    return Bot.extractToolCallParams(toolCall);
                });
                const toolRequestHash = stableHash(JSON.stringify(toolRequests));
                this.toolCallCache.set(toolRequestHash, toolRequests);
                let toolRequestMessage = "I want to use: \n";
                toolRequestMessage += toolRequests
                    .map(
                        (toolRequest) =>
                            toolRequest.toolname + " with arguments " + JSON.stringify(toolRequest.toolArgs),
                    )
                    .join("\nand\n");
                toolRequestMessage += ".";

                await say(buildApprovalButtons(toolRequestMessage, toolRequestHash));
            } else {
                await say({ blocks: [buildMarkdownSection(llmResponse?.content || "...")] });
            }
        } catch (e) {
            logger.error(e);
            await say("I'm sorry, something went wrong. Please try again in a little while.");
        }
    };

    static isMessageInThread(message: bolt.KnownEventFromType<"message">): {
        isInThread: boolean;
        message: bolt.types.GenericMessageEvent;
    } {
        if (message.subtype !== undefined) {
            return { isInThread: false, message: message as unknown as bolt.types.GenericMessageEvent };
        }

        if (message.thread_ts === undefined) {
            return { isInThread: false, message: message as bolt.types.GenericMessageEvent };
        }
        return { isInThread: true, message: message };
    }

    async processToolCall(toolCallParams: toolCallParams): Promise<toolCallResult> {
        const toolCallResult: toolCallResult = {
            success: false,
            toolname: toolCallParams.toolname,
            toolArgs: toolCallParams.toolArgs,
            toolResult: undefined,
        };
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

    static extractToolCallParams(toolCall: ChatCompletionMessageToolCall): toolCallParams {
        const toolCallParams: toolCallParams = {
            toolname: toolCall.function.name,
            toolArgs: JSON.parse(toolCall.function.arguments),
        };
        return toolCallParams;
    }

    static toChatCompletionMessages(conversationReplies: ConversationsRepliesResponse): ChatCompletionMessageParam[] {
        if (!conversationReplies.messages) {
            return [];
        }
        return conversationReplies.messages
            .filter((message) => (message as any).subtype === undefined)
            .map((message) => {
                return {
                    role: message.bot_id ? "assistant" : "user",
                    content: message.text || "",
                } as ChatCompletionMessageParam;
            });
    }

    static getSystemMessage(tools: Tool[]) {
        const currentDateTime = new Date().toLocaleString();
        const systemMessage: ChatCompletionSystemMessageParam = {
            role: "system",
            content: `
#### CONTEXT
Nous sommes le ${currentDateTime}.
You are a friendly slack assistant that can help answer questions and help with tasks. 
      `,
        };
        return systemMessage;
    }
}

export default Bot;
