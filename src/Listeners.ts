import type { AssistantThreadStartedMiddleware, AssistantUserMessageMiddleware } from "@slack/bolt";
import type { ConversationsRepliesResponse } from "@slack/web-api";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { llmClient } from "./LlmClient.js";

export const threadStarted: AssistantThreadStartedMiddleware = async ({ event, logger, say }) => {
    try {
        await say("Hi, how can I help?");
    } catch (e) {
        logger.error(e);
    }
};

export const userMessage: AssistantUserMessageMiddleware = async ({ client, logger, message, say }) => {
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
        const chatCompletionMessages = convertConversationRepliesToChatCompletionMessages(conversationReplies);
        const llmResponse = await llmClient.getResponse(chatCompletionMessages);
        try {
            await say({ text: llmResponse });
        } catch (e) {
            logger.error(e);
        }
    }
};

function convertConversationRepliesToChatCompletionMessages(
    conversationReplies: ConversationsRepliesResponse,
): ChatCompletionMessageParam[] {
    if (!conversationReplies.messages) {
        return [];
    }
    const chatCompletionMessages = conversationReplies.messages
        .filter((message) => (message as any).subtype === undefined)
        .map((message) => {
            return {
                role: message.bot_id ? "assistant" : "user",
                content: message.text || "",
            } as ChatCompletionMessageParam;
        });
    return chatCompletionMessages;
}
