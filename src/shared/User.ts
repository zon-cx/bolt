import { McpSession } from "../slack/McpSession.js";
import logger from "./logger.js";

export type McpServerAuth = {
    serverUrl: string;
    serverName: string;
    mcpCodeVerifier?: string;
    mcpTokens?: string;
    mcpClientInformation?: string;
    mcpAuthorizationCode?: string; // Todo clean ?
};

export class User {
    private _slackUserId: string;
    private _mcpSession: McpSession | null;
    private _mcpServerAuths: Record<string, McpServerAuth>; // indexed by serverUrl

    constructor(slackUserId: string) {
        this._slackUserId = slackUserId;
        this._mcpSession = null;
        this._mcpServerAuths = {};
    }

    get id() {
        return this._slackUserId;
    }

    get mcpSession() {
        return this._mcpSession;
    }

    get mcpServerAuths() {
        return this._mcpServerAuths;
    }

    closeMcpSession() {
        if (this._mcpSession) {
            this._mcpSession = null;
        } else {
            logger.warn("Attempting to close non-existing mcp session for user " + this._slackUserId);
        }
    }

    async startMcpSession(threadTs: string, channelId: string) {
        if (this._mcpSession) {
            throw new Error("Attempting to start mcp session for user but it already exists");
        }
        this._mcpSession = new McpSession(this._slackUserId, threadTs, channelId);
        await this._mcpSession.start();
    }

    getMcpServerAuth(serverUrl: string) {
        if (!this._mcpServerAuths[serverUrl]) {
            throw new Error("No mcp server auth found for user " + this._slackUserId + " and server url " + serverUrl);
        }
        return this._mcpServerAuths[serverUrl];
    }

    setMcpServerAuth(serverUrl: string, mcpServerAuth: McpServerAuth) {
        this._mcpServerAuths[serverUrl] = mcpServerAuth;
    }
}
