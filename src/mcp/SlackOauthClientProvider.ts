import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformation, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { OAuthClientInformationSchema, OAuthTokensSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { slackClient } from "../slack/slackClient.js";
import { buildAuthorizeMessage } from "../slack/utils.js";
import { userSessionStore } from "../shared/userSessionStore.js";
import { mcpSessionStore } from "../slack/mcpSessionStore.js";
import logger from "../shared/logger.js";

const SESSION_KEYS = {
    CODE_VERIFIER: "mcp_code_verifier",
    SERVER_URL: "mcp_server_url",
    TOKENS: "mcp_tokens",
    CLIENT_INFORMATION: "mcp_client_information",
} as const;

const SLACK_REDIRECT_URL = "https://slack.com/app_redirect?app=A08K6THK59N&team=T07B32X7TGV";

export class SlackOAuthClientProvider implements OAuthClientProvider {
    private _userId: string;
    private _serverUrl: string;

    constructor(userId: string, serverUrl: string) {
        this._userId = userId;
        this._serverUrl = serverUrl;
    }

    get redirectUrl() {
        return SLACK_REDIRECT_URL;
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
        const userSession = userSessionStore.get(this._userId);
        logger.debug(" start Get client information for user " + this._userId, userSession);
        if (!userSession) {
            return undefined;
        }
        const value = userSession.mcpServerAuths[this._serverUrl]!.mcpClientInformation;
        if (!value) {
            return undefined;
        }
        logger.debug("Get client information: " + value);
        return await OAuthClientInformationSchema.parseAsync(JSON.parse(value));
    }

    saveClientInformation(clientInformation: OAuthClientInformation) {
        const userSession = userSessionStore.get(this._userId);
        logger.debug(" start Save client information for user " + this._userId, userSession);
        if (!userSession) {
            logger.error("No user session found for user " + this._userId);
            return;
        }
        userSession.mcpServerAuths[this._serverUrl]!.mcpClientInformation = JSON.stringify(clientInformation);
        userSessionStore.update(this._userId, userSession);
        logger.debug("Saved client information: " + JSON.stringify(clientInformation));
    }

    async tokens() {
        const userSession = userSessionStore.get(this._userId);
        if (!userSession) {
            return undefined;
        }
        const tokens = userSession.mcpServerAuths[this._serverUrl]!.mcpTokens;
        if (!tokens) {
            return undefined;
        }
        logger.debug("Get tokens: " + tokens);
        return await OAuthTokensSchema.parseAsync(JSON.parse(tokens));
    }

    saveTokens(tokens: OAuthTokens) {
        const userSession = userSessionStore.get(this._userId);
        if (!userSession) {
            return;
        }
        userSession.mcpServerAuths[this._serverUrl]!.mcpTokens = JSON.stringify(tokens);
        userSessionStore.update(this._userId, userSession);
        logger.debug("Saved tokens: " + JSON.stringify(tokens));
    }

    redirectToAuthorization(authorizationUrl: URL) {
        logger.debug(" start Redirect to authorization for user " + this._userId, authorizationUrl);
        const userSession = userSessionStore.get(this._userId);
        if (!userSession) {
            return;
        }
        const mcpSession = mcpSessionStore.getById(userSession.mcpSessionId || "");
        if (!mcpSession) {
            logger.error("No MCP session found for user " + this._userId);
            return;
        }
        logger.debug("Redirect to authorization: " + authorizationUrl.href);
        try {
            slackClient.updateMessage(
                buildAuthorizeMessage(
                    userSession.mcpServerAuths[this._serverUrl]!.serverName,
                    authorizationUrl.href,
                    "Authorize",
                ).blocks,
                mcpSession.mcpHost.clients[userSession.mcpServerAuths[this._serverUrl]!.serverName]!.connectMessageId!
                    .messageTs,
                mcpSession.channelId,
            );
        } catch (error) {
            logger.error("Error updating message: " + error);
        }
        // slackClient.postBlocks(
        //     buildRedirectButton(
        //         authorizationUrl.href,
        //         "Authorize " + userSession.mcpServerAuths[this._serverUrl]!.serverName,
        //     ),
        //     mcpSession.threadTs,
        //     mcpSession.channelId,
        // );
    }

    saveCodeVerifier(codeVerifier: string) {
        const userSession = userSessionStore.get(this._userId);
        if (!userSession) {
            return;
        }
        userSession.mcpServerAuths[this._serverUrl]!.mcpCodeVerifier = codeVerifier;
        userSessionStore.update(this._userId, userSession);
        logger.debug("Saved code verifier: " + codeVerifier);
    }

    async codeVerifier() {
        logger.debug(" 1 Get code verifier");
        const userSession = userSessionStore.get(this._userId);
        if (!userSession) {
            throw new Error("No user session found for user " + this._userId);
        }
        const verifier = userSession.mcpServerAuths[this._serverUrl]!.mcpCodeVerifier;
        if (!verifier) {
            throw new Error("No code verifier saved for session");
        }
        logger.debug("Get code verifier: " + verifier);
        return verifier;
    }
}
