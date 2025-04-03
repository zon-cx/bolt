import { WebClient } from "@slack/web-api";
import { getOrThrow } from "../shared/utils.js";

class SlackClient {
    private _webClient: WebClient;

    constructor() {
        this._webClient = new WebClient(getOrThrow("SLACK_BOT_TOKEN"));
    }

    async postMessage(message: string, threadTs: string, channelId: string) {
        const result = await this._webClient.chat.postMessage({
            text: message,
            thread_ts: threadTs,
            channel: channelId,
        });
        return result;
    }

    async postBlocks(blocks: any, threadTs: string, channelId: string) {
        const result = await this._webClient.chat.postMessage({
            ...blocks,
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

    async updateMessage(blocks: any, threadTs: string, channelId: string) {
        const result = await this._webClient.chat.update({
            blocks: blocks,
            ts: threadTs,
            channel: channelId,
        });
        return result;
    }
}

export const slackClient = new SlackClient();
