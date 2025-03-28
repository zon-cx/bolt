import bolt, { type AssistantThreadStartedMiddleware, type AssistantUserMessageMiddleware } from "@slack/bolt";
import { getOrThrow } from "../shared/utils.js";
import { McpHost } from "../mcp/McpHost.js";
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
    private _app: bolt.App;
    private _mcpHost: McpHost;
    private _tools: Tool[];
    private _toolCallCache: OrderedFixedSizeMap<string, toolCallParams[]>;
    constructor(mcpHost: McpHost) {
        this._app = new bolt.App({
            token: getOrThrow("SLACK_BOT_TOKEN"),
            appToken: getOrThrow("SLACK_APP_TOKEN"),
            signingSecret: getOrThrow("SLACK_SIGNING_SECRET"),
            logLevel: bolt.LogLevel.INFO,
            socketMode: true,
        });
        this._mcpHost = mcpHost;
        this._tools = [];
        this._toolCallCache = new OrderedFixedSizeMap<string, toolCallParams[]>(50);
    }

    async start() {
        this._tools = this._mcpHost.getTools();
        const assistant = new bolt.Assistant({
            threadStarted: this._threadStarted,
            userMessage: this._userMessage,
        });

        this._app.assistant(assistant);
        this._app.action("approve_tool_call", this._proceedWithToolCallAction);
        this._app.action("cancel_tool_call", this._cancelToolCallAction);
        await this._app.start(process.env.PORT || 3000);
    }

    private _cancelToolCallAction = async ({
        payload,
        body,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        ack();
        const toolCallParams = this._toolCallCache.getAndDelete(payload.value || "");
        await respond({
            text: "Ok, I'm not going to use that tool. What else can I do for you?",
        });
    };

    private _proceedWithToolCallAction = async ({
        payload,
        body,
        action,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        ack();
        const toolCallParams = this._toolCallCache.getAndDelete(payload.value || "");
        if (!toolCallParams) {
            logger.error("Tool call params not found in cache");
            await say({ text: "Sorry something went wrong. Please try again.", thread_ts: body.container.thread_ts });
            return;
        }
        await respond({ text: "Ok, I'm working on it..." });
        const toolCallResults = await Promise.all(toolCallParams.map(this._processToolCall.bind(this)));
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
        const interpretation = await llmClient.getResponse(chatCompletionMessages, this._tools);
        logger.debug("Tool call interpretation: - " + interpretation?.content);
        await say({
            blocks: [buildMarkdownSection(interpretation?.content || "...")],
            thread_ts: body.container.thread_ts,
        });
    };

    private _threadStarted: AssistantThreadStartedMiddleware = async ({ event, say }) => {
        try {
            await say(formatWelcomeMessage(this._tools));
        } catch (e) {
            logger.error(e);
        }
    };

    private _userMessage: AssistantUserMessageMiddleware = async ({ client, message, say }) => {
        try {
            const { isInThread, message: messageInThread } = Bot._isMessageInThread(message);
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
            const chatCompletionMessages = Bot._toChatCompletionMessages(conversationReplies);
            chatCompletionMessages.unshift(Bot._getSystemMessage(this._tools));

            const llmResponse = await llmClient.getResponse(chatCompletionMessages, this._tools);

            // Handle tool calls
            if (llmResponse?.tool_calls && llmResponse.tool_calls.length > 0) {
                const toolRequests = llmResponse.tool_calls.map((toolCall) => {
                    return Bot._extractToolCallParams(toolCall);
                });
                const toolRequestHash = stableHash(JSON.stringify(toolRequests));
                this._toolCallCache.set(toolRequestHash, toolRequests);
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

    private static _isMessageInThread(message: bolt.KnownEventFromType<"message">): {
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

    private async _processToolCall(toolCallParams: toolCallParams): Promise<toolCallResult> {
        const toolCallResult: toolCallResult = {
            success: false,
            toolname: toolCallParams.toolname,
            toolArgs: toolCallParams.toolArgs,
            toolResult: undefined,
        };
        try {
            toolCallResult.toolResult = await this._mcpHost.executeTool(
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

    private static _extractToolCallParams(toolCall: ChatCompletionMessageToolCall): toolCallParams {
        const toolCallParams: toolCallParams = {
            toolname: toolCall.function.name,
            toolArgs: JSON.parse(toolCall.function.arguments),
        };
        return toolCallParams;
    }

    private static _toChatCompletionMessages(
        conversationReplies: ConversationsRepliesResponse,
    ): ChatCompletionMessageParam[] {
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

    private static _getSystemMessage(tools: Tool[]) {
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
