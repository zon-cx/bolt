import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformation, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { OAuthClientInformationSchema, OAuthTokensSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { slackClient } from "../slack/slackClient.js";
import messageBuilder from "../slack/messageBuilder.js";
import { userStore } from "../shared/userStore.js";
import logger from "../shared/logger.js";

export class SlackOAuthClientProvider implements OAuthClientProvider {
    private _userId: string;
    private _serverUrl: string;
    private _redirectUrl: string;

    constructor(userId: string, serverUrl: string, redirectUrl: string) {
        this._userId = userId;
        this._serverUrl = serverUrl;
        this._redirectUrl = redirectUrl;
    }

    get redirectUrl() {
        return this._redirectUrl;
    }

    get clientMetadata() {
        return {
            redirect_uris: [this.redirectUrl],
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            client_name: "Slack MCP Bot",
            client_uri: "https://github.com/modelcontextprotocol/slack-mcp-bot",
        };
    }

    async clientInformation() {
        const user = userStore.get(this._userId);
        if (!user) {
            logger.error("No user found for user " + this._userId + "when getting client information");
            return undefined;
        }
        const value = user.mcpServerAuths[this._serverUrl]!.mcpClientInformation;
        if (!value) {
            return undefined;
        }
        return await OAuthClientInformationSchema.parseAsync(JSON.parse(value));
    }

    saveClientInformation(clientInformation: OAuthClientInformation) {
        const user = userStore.get(this._userId);
        if (!user) {
            logger.error("No user found for user " + this._userId);
            return;
        }
        user.mcpServerAuths[this._serverUrl]!.mcpClientInformation = JSON.stringify(clientInformation);
        userStore.update(this._userId, user);
    }

    async tokens() {
        const user = userStore.get(this._userId);
        if (!user || !user.mcpServerAuths[this._serverUrl]) {
            return undefined;
        }
        const tokens = user.mcpServerAuths[this._serverUrl]!.mcpTokens;
        if (!tokens) {
            return undefined;
        }
        return await OAuthTokensSchema.parseAsync(JSON.parse(tokens));
    }

    saveTokens(tokens: OAuthTokens) {
        const user = userStore.get(this._userId);
        if (!user) {
            return;
        }
        user.mcpServerAuths[this._serverUrl]!.mcpTokens = JSON.stringify(tokens);
        userStore.update(this._userId, user);
    }

    redirectToAuthorization(authorizationUrl: URL) {
        const user = userStore.get(this._userId);
        if (!user) {
            logger.error("No user found for user " + this._userId);
            return;
        }
        const mcpSession = user.mcpSession;
        if (!mcpSession) {
            logger.error("No MCP session found for user " + this._userId);
            return;
        }
        try {
            slackClient.updateMessage(
                messageBuilder.authorizeMessage(
                    user.mcpServerAuths[this._serverUrl]!.serverName,
                    authorizationUrl.href,
                    this._serverUrl,
                    "Authorize",
                ),
                mcpSession.connectMessageIds[this._serverUrl]!.messageTs,
                mcpSession.connectMessageIds[this._serverUrl]!.channelId,
            );
        } catch (error) {
            logger.error("Error updating message: " + error);
        }
    }

    saveCodeVerifier(codeVerifier: string) {
        const user = userStore.get(this._userId);
        if (!user) {
            return;
        }
        user.mcpServerAuths[this._serverUrl]!.mcpCodeVerifier = codeVerifier;
        userStore.update(this._userId, user);
    }

    async codeVerifier() {
        const user = userStore.get(this._userId);
        if (!user) {
            throw new Error("No user found for user " + this._userId);
        }
        const verifier = user.mcpServerAuths[this._serverUrl]!.mcpCodeVerifier;
        if (!verifier) {
            throw new Error("No code verifier saved for session");
        }
        return verifier;
    }
}
