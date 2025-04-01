import bolt, { type AssistantThreadStartedMiddleware, type AssistantUserMessageMiddleware } from "@slack/bolt";
import { getOrThrow } from "../shared/utils.js";
import type { Tool } from "../mcp/Tool.js";
import type { ConversationsRepliesResponse } from "@slack/web-api";
import { llmClient } from "../llm/LlmClient.js";
import type {
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import logger from "../shared/logger.js";
import { buildApprovalButtons, buildMarkdownSection } from "./utils.js";
import { stableHash } from "stable-hash";
import { sessionStore } from "./sessionStore.js";
import { Session } from "./Session.js";
import { actionRequestStore } from "./actionRequestStore.js";
import type { ToolCallRequest, McpClientConnectionRequest, ToolCallsRequest } from "./actionRequestStore.js";
import { slackClient } from "./slackClient.js";

interface toolCallParams {
    toolName: string;
    toolArgs: Record<string, any>;
}

export class Bot {
    private _app: bolt.App;
    private _tools: Tool[];
    constructor() {
        this._app = new bolt.App({
            token: getOrThrow("SLACK_BOT_TOKEN"),
            appToken: getOrThrow("SLACK_APP_TOKEN"),
            signingSecret: getOrThrow("SLACK_SIGNING_SECRET"),
            logLevel: bolt.LogLevel.INFO,
            socketMode: true,
        });
        this._tools = [];
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
        this._app.action("connect_client", this._connectClientAction);
        await this._app.start(process.env.PORT || 3000);
    }

    private _connectClientAction = async ({
        payload,
        body,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        ack();
        const connectionRequest = actionRequestStore.getAndDelete(payload.value || "") as
            | McpClientConnectionRequest
            | undefined;
        if (!connectionRequest) {
            logger.error("No connection request found in cache");
            await respond({ text: "Sorry something went wrong. Start a new chat and try again." });
            return;
        }
        const session = sessionStore.getSessionById(connectionRequest.sessionId);
        if (!session) {
            logger.error("Session not found for sessionId: " + connectionRequest.sessionId);
            await respond({ text: "Sorry something went wrong. Start a new chat and try again." });
            return;
        }
        try {
            await session.mcpHost.connect(connectionRequest.serverName);
            await respond({ text: "- *" + connectionRequest.serverName + "* - Connected ✅" });
        } catch (e) {
            logger.error("Error connecting to server: " + connectionRequest.serverName);
            await respond({ text: "- Cannot connect to " + connectionRequest.serverName + " ❌" });
        }
    };

    // Only usefull to ack() and remove the warning from the slack interface
    private _redirectAction = async ({
        payload,
        body,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        ack();
        await respond({ text: "Check your browser" });
    };

    private _cancelToolCallAction = async ({
        payload,
        body,
        ack,
        respond,
        say,
    }: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.ButtonAction>>) => {
        ack();
        const toolCallParams = actionRequestStore.getAndDelete(payload.value || "") as ToolCallRequest | undefined;
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
        const session = sessionStore.getSessionById(toolCallsRequest?.sessionId || "");
        if (!toolCallsRequest || !session) {
            logger.error("Tool call request or session not found in cache");
            await respond({ text: "Sorry something went wrong. Please try again." });
            return;
        }

        await respond({ text: "Ok, I'm working on it..." });

        await Promise.all(
            toolCallsRequest.toolRequests.map((toolCallRequest) =>
                this._processToolCallRequest(toolCallRequest, session),
            ),
        );
        if (!toolCallsRequest.toolRequests.every((toolCallRequest) => toolCallRequest.success)) {
            await respond({ text: "Sorry something went wrong. Please try again." });
            return;
        }
        console.dir(toolCallsRequest, { depth: null });
        const chatCompletionMessages: ChatCompletionMessageParam[] = [];
        chatCompletionMessages.push({
            role: "system",
            content: `
            You are a helpful assistant. You've just used a tool and received results. Interpret these results for the user in a clear, helpful way. Please format your response as markdown.`,
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
        const interpretation = await llmClient.getResponse(chatCompletionMessages, this._tools);
        logger.debug("Tool call interpretation: - " + interpretation?.content);
        await slackClient.postBlocks(
            { blocks: [buildMarkdownSection(interpretation?.content || "...")] },
            session.threadTs,
            session.channelId,
        );
    };

    private _threadStarted: AssistantThreadStartedMiddleware = async ({ event, say }) => {
        // Todo: close the previous session of the current user if it exists.
        try {
            const session = new Session(
                event.assistant_thread.user_id,
                event.assistant_thread.thread_ts,
                event.assistant_thread.channel_id,
            );
            sessionStore.setSession(session);
            session.start();
            // slackClient.postButton(
            //     buildRedirectButton("https://slack.com/app_redirect?app=A08K6THK59N&team=T07B32X7TGV"),
            // );
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
            const session = sessionStore.getSession(messageInThread.user, messageInThread.thread_ts!);
            if (!session) {
                logger.error("Session not found for thread: " + messageInThread.thread_ts);
                say("I'm sorry, something went wrong. Please try again in a little while.");
                return;
            }

            // Get the last 5 messages in the thread and prepare it for the LLM with the system message
            const { user, channel, thread_ts } = messageInThread;
            //Todo use the slackClient to get the conversation replies
            const conversationReplies = await client.conversations.replies({
                channel: channel,
                ts: thread_ts!,
                limit: 5,
            });
            const chatCompletionMessages = Bot._toChatCompletionMessages(conversationReplies);
            chatCompletionMessages.unshift(Bot._getSystemMessage(this._tools));

            const llmResponse = await llmClient.getResponse(chatCompletionMessages, session.mcpHost.tools);

            // Handle tool calls
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
                    sessionId: session.sessionId,
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
                    buildApprovalButtons(toolRequestMessage, toolRequestHash),
                    session.threadTs,
                    session.channelId,
                );
            } else {
                await slackClient.postBlocks(
                    { blocks: [buildMarkdownSection(llmResponse?.content || "...")] },
                    session.threadTs,
                    session.channelId,
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

    private async _processToolCallRequest(toolCallRequest: ToolCallRequest, session: Session): Promise<void> {
        try {
            await session.mcpHost.processToolCallRequest(toolCallRequest);
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
