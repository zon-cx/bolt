import { mcpJsonConfig } from "../mcp/mcpConfig.js";
import { McpHost } from "../mcp/McpHost.js";
import logger from "../shared/logger.js";
import type { ToolCallRequest } from "./actionRequestStore.js";
import { slackClient } from "./slackClient.js";
import { buildClientConnectionMessage, buildWelcomeMessage } from "./utils.js";
import { actionRequestStore } from "./actionRequestStore.js";
import type { McpClient } from "../mcp/McpClient.js";

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
        this._mcpHost = new McpHost(mcpJsonConfig, this._sessionId);
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
        await this.postConnectedClients();
        logger.info("Session started: " + this._sessionId);
    }

    async postConnectedClients() {
        await slackClient.postBlocks(buildWelcomeMessage(), this._threadTs, this._channelId);
        for (const [name, client] of Object.entries(this._mcpHost.clients)) {
            await this.postConnectedClient(client);
        }
    }

    async postConnectedClient(client: McpClient) {
        await slackClient.postBlocks(
            buildClientConnectionMessage(client.serverName, client.clientId, client.isConnected()),
            this._threadTs,
            this._channelId,
        );
        if (!client.isConnected()) {
            actionRequestStore.set(client.clientId, {
                type: "mcp_client_connect",
                sessionId: this._sessionId,
                serverName: client.serverName,
            });
        }
    }
}
