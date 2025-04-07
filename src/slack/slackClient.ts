import { WebClient } from "@slack/web-api";
import { getOrThrow } from "../shared/utils.js";
import type { KnownBlock, Block } from "@slack/web-api";

class SlackClient {
    private _webClient: WebClient;

    constructor() {
        this._webClient = new WebClient(getOrThrow("SLACK_BOT_TOKEN"));
    }

    async postBlocks(blocks: { blocks: (KnownBlock | Block)[]; text?: string }, threadTs: string, channelId: string) {
        const result = await this._webClient.chat.postMessage({
            ...blocks,
            thread_ts: threadTs,
            channel: channelId,
        });
        return result;
    }

    async postMarkdown(text: string, threadTs: string, channelId: string) {
        const blocks = [{ type: "markdown", text }] as unknown as KnownBlock[];
        const result = await this._webClient.chat.postMessage({
            blocks,
            thread_ts: threadTs,
            channel: channelId,
        });
        return result;
    }

    async postButton(button: any, threadTs: string, channelId: string) {
        const result = await this._webClient.chat.postMessage({
            text: "whatever",
            thread_ts: threadTs,
            channel: channelId,
            blocks: button.blocks,
        });
        return result;
    }

    async updateMessage(
        blocks: { blocks: (KnownBlock | Block)[]; text?: string },
        threadTs: string,
        channelId: string,
    ) {
        const result = await this._webClient.chat.update({
            ...blocks,
            ts: threadTs,
            channel: channelId,
        });
        return result;
    }
}

export const slackClient = new SlackClient();
