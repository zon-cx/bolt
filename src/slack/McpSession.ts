import { mcpJsonConfig } from "../mcp/mcpConfig.js";
import { McpHost } from "../mcp/McpHost.js";
import logger from "../shared/logger.js";
import type { ToolCallRequest } from "./actionRequestStore.js";
import { slackClient } from "./slackClient.js";
import { buildClientConnectionMessage, buildWelcomeMessage } from "./utils.js";
import { actionRequestStore } from "./actionRequestStore.js";
import type { McpClient } from "../mcp/McpClient.js";
import type { McpClientConnectionRequest } from "./actionRequestStore.js";

// Correspond to a thread started with the slack Bot. It has its own sets of mcp clients.
export class McpSession {
    private _mcpSessionId: string;
    private _userId: string;
    private _threadTs: string;
    private _channelId: string;
    private _mcpHost: McpHost;

    constructor(userId: string, threadTs: string, channelId: string) {
        // TODO: better sessionId
        this._mcpSessionId = userId + "-" + threadTs;
        this._userId = userId;
        this._threadTs = threadTs;
        this._channelId = channelId;
        this._mcpHost = new McpHost(mcpJsonConfig, this._userId);
    }

    get mcpHost() {
        return this._mcpHost;
    }

    get mcpSessionId() {
        return this._mcpSessionId;
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
        await this.postConnectToClients();
        logger.info("MCP Session started: " + this._mcpSessionId);
    }

    async postConnectToClients() {
        await slackClient.postBlocks(buildWelcomeMessage(), this._threadTs, this._channelId);
        for (const [name, client] of Object.entries(this._mcpHost.clients)) {
            const postResult = await this.postConnectToClient(client);
            if (postResult) {
                client.connectMessageId = { messageTs: postResult.ts!, channelId: postResult.channel! };
            } else {
                throw new Error("Error posting connect message for mcp client: " + name);
            }
        }
    }

    async postConnectToClient(client: McpClient) {
        const postResult = await slackClient.postBlocks(
            buildClientConnectionMessage(client.serverName, client.clientId, client.isConnected()),
            this._threadTs,
            this._channelId,
        );
        if (!client.isConnected()) {
            const connectionRequest: McpClientConnectionRequest = {
                type: "mcp_client_connect",
                userId: this._userId,
                serverName: client.serverName,
            };
            actionRequestStore.set(client.clientId, connectionRequest);
        }
        return postResult;
    }
}
