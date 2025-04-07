import bolt, { type AssistantThreadStartedMiddleware, type AssistantUserMessageMiddleware } from "@slack/bolt";
import { getOrThrow } from "../shared/utils.js";
import type { ConversationsRepliesResponse } from "@slack/web-api";
import { llmClient } from "../llm/LlmClient.js";
import type {
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import logger from "../shared/logger.js";
import messageBuilder from "./messageBuilder.js";
import { stableHash } from "stable-hash";
import { McpSession } from "../mcp/McpSession.js";
import { actionRequestStore } from "./actionRequestStore.js";
import type { ToolCallRequest, McpClientConnectionRequest, ToolCallsRequest } from "./actionRequestStore.js";
import { slackClient } from "./slackClient.js";
import { userStore } from "../shared/userStore.js";
import { User } from "../shared/User.js";

export class Bot {
    private _app: bolt.App;
    constructor() {
        this._app = new bolt.App({
            token: getOrThrow("SLACK_BOT_TOKEN"),
            appToken: getOrThrow("SLACK_APP_TOKEN"),
            signingSecret: getOrThrow("SLACK_SIGNING_SECRET"),
            logLevel: bolt.LogLevel.INFO,
            socketMode: true,
        });
    }

    async start() {
        const assistant = new bolt.Assistant({
            threadStarted: this._threadStarted,
            userMessage: this._userMessage,
        });

        this._app.assistant(assistant);
        this._app.action("approve_tool_call", this._proceedWithToolCallAction);
        this._app.action("cancel_tool_call", this._cancelToolCallAction);
        this._app.action("redirect", this._redirectAction);
        await this._app.start(process.env.PORT || 3000);
    }

    // Only usefull to ack() and remove the warning from the slack interface
    private _redirectAction = async ({
        payload,
        body,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        // Todo use proper action value
        ack();
        await respond({ text: "Check your browser!" });
    };

    private _cancelToolCallAction = async ({
        payload,
        body,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        ack();
        if (!payload.value) {
            logger.error("No payload value found");
            await respond({ text: "Sorry something went wrong. Please try again." });
            return;
        }
        const toolCallParams = actionRequestStore.getAndDelete(payload.value) as ToolCallRequest | undefined;
        if (!toolCallParams) {
            logger.error("Tool call params not found in cache");
            await respond({ text: "Sorry something went wrong. Please try again." });
            return;
        }
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
        const toolCallsRequest = actionRequestStore.getAndDelete(payload.value || "") as ToolCallsRequest | undefined;
        if (!toolCallsRequest || !toolCallsRequest.userId) {
            logger.error("Tool call request not found in cache");
            await respond({ text: "Sorry something went wrong. Please try again." });
            return;
        }
        const user = userStore.get(toolCallsRequest.userId);
        const mcpSession = user?.mcpSession;
        if (!mcpSession) {
            logger.error("No mcpSession found for userId: " + toolCallsRequest.userId);
            await respond({ text: "Sorry something went wrong. Please try again." });
            return;
        }

        await respond({ text: "Ok, I'm working on it..." });

        await Promise.all(
            toolCallsRequest.toolRequests.map((toolCallRequest) =>
                this._processToolCallRequest(toolCallRequest, mcpSession),
            ),
        );
        if (!toolCallsRequest.toolRequests.every((toolCallRequest) => toolCallRequest.success)) {
            await respond({ text: "Sorry something went wrong. Please try again." });
            return;
        }
        const chatCompletionMessages: ChatCompletionMessageParam[] = [];
        chatCompletionMessages.push({
            role: "system",
            content: `
            You are a helpful assistant. You've just used a tool and received results. Interpret these results for the user in a clear, helpful way. Please format your response as markdown.
            Just give me your interpretation of the results, no preamble.`,
        });
        let toolCallResultsMessages = "I used the tools:\n";
        toolCallResultsMessages += toolCallsRequest.toolRequests.map((toolCallRequest) => {
            return `- ${toolCallRequest.toolName} with arguments "${toolCallRequest.toolArgs}" and got this result:\n${toolCallRequest.toolCallResult.content[0].text}\n`; //TODO type the toolCallResult
        });
        toolCallResultsMessages += "\n\nPlease interpret these results for me.";
        chatCompletionMessages.push({
            role: "user",
            content: toolCallResultsMessages,
        });
        const interpretation = await llmClient.getResponse(chatCompletionMessages, []);
        logger.debug(
            "Tool call interpretated for tools : " +
                toolCallsRequest.toolRequests.map((toolCallRequest) => toolCallRequest.toolName).join(", ") +
                " - " +
                interpretation?.content,
        );
        await slackClient.postMarkdown(interpretation?.content || "...", mcpSession.threadTs, mcpSession.channelId);
    };

    // This event correspond to the start of an mcpSession. Opening a new thread closes the previous mcpSession
    private _threadStarted: AssistantThreadStartedMiddleware = async ({ event, say }) => {
        logger.debug(
            "Thread started for user " +
                event.assistant_thread.user_id +
                " with thread ts " +
                event.assistant_thread.thread_ts,
        );
        try {
            let user = userStore.get(event.assistant_thread.user_id);
            if (user) {
                // Close the previous mcp session of the current user if it exists.
                if (user.mcpSession) {
                    logger.debug("Deleting previous mcp session for user " + user);
                    user.closeMcpSession();
                }
            } else {
                user = new User(event.assistant_thread.user_id);
                userStore.new(event.assistant_thread.user_id, user);
            }

            await user.startMcpSession(event.assistant_thread.thread_ts, event.assistant_thread.channel_id);
        } catch (e) {
            logger.error(e);
            say("I'm sorry, something went wrong. Please try starting a new conversation.");
        }
    };

    private _userMessage: AssistantUserMessageMiddleware = async ({ client, message, say }) => {
        try {
            const { isInThread, message: messageInThread } = Bot._isMessageInThread(message);
            if (!isInThread) {
                say("I'm sorry, I can only help in a thread!");
                return;
            }
            const user = userStore.get(messageInThread.user);
            if (!user) {
                logger.error("user not found : " + messageInThread.user);
                say("I'm sorry, something went wrong. Please try again in a little while.");
                return;
            }
            const mcpSession = user.mcpSession;
            if (!mcpSession) {
                logger.error("mcpSession not found for thread: " + messageInThread.thread_ts);
                say("I'm sorry, something went wrong. Please try again in a little while.");
                return;
            }

            // Get the last 5 messages in the thread and prepare it for the LLM with the system message
            //Todo use the slackClient to get the conversation replies
            const conversationReplies = await client.conversations.replies({
                channel: messageInThread.channel,
                ts: messageInThread.thread_ts!,
                limit: 5,
            });
            const chatCompletionMessages = Bot._toChatCompletionMessages(conversationReplies);
            chatCompletionMessages.unshift(Bot._getSystemMessage()); // add the system message at the beginning of the conversation

            const llmResponse = await llmClient.getResponse(chatCompletionMessages, mcpSession.tools);

            // Handle tool calls in llm response
            if (llmResponse?.tool_calls && llmResponse.tool_calls.length > 0) {
                const toolRequests = llmResponse.tool_calls.map((toolCall) => {
                    return {
                        ...Bot._extractToolCallParams(toolCall),
                        toolCallResult: null,
                        success: false,
                    };
                });
                const toolCallRequests: ToolCallsRequest = {
                    type: "tool_calls",
                    userId: user.id,
                    toolRequests: toolRequests,
                };
                const toolRequestHash = stableHash(JSON.stringify(toolRequests));
                actionRequestStore.set(toolRequestHash, toolCallRequests);
                let toolRequestMessage = "I want to use: \n";
                toolRequestMessage += toolRequests
                    .map(
                        (toolRequest) =>
                            toolRequest.toolName + " with arguments " + JSON.stringify(toolRequest.toolArgs),
                    )
                    .join("\nand\n");
                toolRequestMessage += ".";
                await slackClient.postBlocks(
                    messageBuilder.approvalButtons(toolRequestMessage, toolRequestHash),
                    mcpSession.threadTs,
                    mcpSession.channelId,
                );
            } else {
                await slackClient.postMarkdown(
                    llmResponse?.content || "...",
                    mcpSession.threadTs,
                    mcpSession.channelId,
                );
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

    private async _processToolCallRequest(toolCallRequest: ToolCallRequest, mcpSession: McpSession): Promise<void> {
        try {
            await mcpSession.processToolCallRequest(toolCallRequest);
            toolCallRequest.success = true;
        } catch (e) {
            logger.error("Error executing tool call: " + toolCallRequest.toolName + " - " + e);
            toolCallRequest.success = false;
        }
    }

    private static _extractToolCallParams(toolCall: ChatCompletionMessageToolCall): {
        toolName: string;
        toolArgs: Record<string, any>;
    } {
        return {
            toolName: toolCall.function.name,
            toolArgs: JSON.parse(toolCall.function.arguments),
        };
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

    private static _getSystemMessage() {
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
