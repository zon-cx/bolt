import { mcpJsonConfig } from "../mcp/mcpConfig.js";
import { McpHost } from "../mcp/McpHost.js";
import logger from "../shared/logger.js";
import type { ToolCallRequest } from "./actionRequestStore.js";
import { slackClient } from "./slackClient.js";
import { buildWelcomeMessages, buildToolMessage } from "./utils.js";

export class Session {
    private _sessionId: string;
    private _userId: string;
    private _threadTs: string;
    private _channelId: string;
    private _mcpHost: McpHost;

    constructor(userId: string, threadTs: string, channelId: string) {
        // TODO: better sessionId
        this._sessionId = userId + "-" + threadTs;
        this._userId = userId;
        this._threadTs = threadTs;
        this._channelId = channelId;
        this._mcpHost = new McpHost(mcpJsonConfig);
    }

    get mcpHost() {
        return this._mcpHost;
    }

    get sessionId() {
        return this._sessionId;
    }

    get userId() {
        return this._userId;
    }

    get threadTs() {
        return this._threadTs;
    }

    get channelId() {
        return this._channelId;
    }

    async processToolCallRequest(toolCallRequest: ToolCallRequest) {
        return await this._mcpHost.processToolCallRequest(toolCallRequest);
    }

    async start() {
        await this._mcpHost.initialize();
        await slackClient.postBlocks(buildWelcomeMessages(this), this._threadTs, this._channelId);
        await slackClient.postBlocks(buildToolMessage(this), this._threadTs, this._channelId);
        logger.info("Session started");
    }
}
