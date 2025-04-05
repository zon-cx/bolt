import logger from "../shared/logger.js";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { auth, UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { HttpClientTransport } from "./HttpTransport.js";
import type { McpClientConfig, McpTools } from "./mcp.types.js";
import { McpToolsArray } from "./mcp.types.js";
import { Tool } from "./Tool.js";
import { SlackOAuthClientProvider } from "./SlackOauthClientProvider.js";
import { McpSession } from "../slack/McpSession.js";
import { mcpSessionStore } from "../slack/mcpSessionStore.js";
import { slackClient } from "../slack/slackClient.js";
import type { User, McpServerAuth } from "../shared/User.js";
import { userStore } from "../shared/userStore.js";
import { getOrThrow } from "../shared/utils.js";

export class McpClient {
    private _config: McpClientConfig;
    private _transport: SSEClientTransport | StdioClientTransport | HttpClientTransport | null;
    private _client: Client;
    private _connected: boolean = false;
    private _userId: string;
    private _serverUrl: string;
    private _authProvider: OAuthClientProvider | null = null;
    public connectMessageId: { messageTs: string; channelId: string } | null = null;
    public serverName: string;
    public tools: Record<string, Tool> = {};

    constructor(serverName: string, config: McpClientConfig, userId: string) {
        this.serverName = serverName;
        this._config = config;
        this._userId = userId;
        this._serverUrl = (config as { url: string }).url;
        this._transport = null;
        this._client = new Client(
            {
                name: this.serverName,
                version: "1.0.0",
            },
            {
                capabilities: {
                    prompts: {},
                    resources: {},
                    tools: {},
                },
            },
        );
        this._connected = false;
        this._authProvider = null;
    }

    get authProvider(): OAuthClientProvider | null {
        return this._authProvider;
    }

    get serverUrl(): string {
        return this._serverUrl;
    }

    get clientId(): string {
        return this._userId + "_" + this.serverName;
    }

    get mcpSession(): McpSession {
        const user = this.user;
        if (!user || !user.mcpSession) {
            throw new Error("No Mcp Session for client " + this.clientId);
        }
        return user.mcpSession;
    }

    get user(): User {
        const user = userStore.get(this._userId);
        if (!user) {
            throw new Error("No User for client " + this.clientId);
        }
        return user;
    }

    get mcpServerAuth(): McpServerAuth | undefined {
        const user = this.user;
        if (!user) {
            throw new Error("No User for client " + this.clientId);
        }
        return user.mcpServerAuths[this._serverUrl];
    }

    set mcpServerAuth(auth: McpServerAuth) {
        const user = this.user;
        if (!user) {
            throw new Error("No User for client " + this.clientId);
        }
        user.mcpServerAuths[this._serverUrl] = auth;
        userStore.update(this._userId, user);
    }

    async connect() {
        if (this._connected) {
            logger.warn("MCP client " + this.serverName + " is already connected.");
            return;
        }
        try {
            logger.debug(
                "Connecting to MCP server " + this.serverName + " with config: " + JSON.stringify(this._config),
            );
            if ("url" in this._config && this._config.url.endsWith("/sse")) {
                // To update for new workflow to detect http or sse
                await this.setupAuthProvider();
                this._transport = new SSEClientTransport(new URL(this._config.url));
            } else if ("url" in this._config) {
                await this.setupAuthProvider();
                this._transport = new HttpClientTransport(new URL(this._config.url), {
                    authProvider: this._authProvider!,
                });
            } else if ("command" in this._config) {
                this._transport = new StdioClientTransport({
                    command: this._config.command,
                    args: this._config.args,
                });
            }
            await this._client.connect(this._transport as Transport);
            const mcpTools = await this._listTools(); // Todo move this to a separate flow
            this._connected = true;
            Object.entries(mcpTools).forEach(([toolName, tool]) => {
                this.tools[toolName] = new Tool(tool, this.serverName);
            });
            logger.info("Connected to MCP Server " + this.serverName);
            return true;
        } catch (error) {
            if (error instanceof UnauthorizedError) {
                return false;
            }
            throw error;
        }
    }

    async disconnect() {
        if (!this._client) {
            throw new Error(`Cannot disconnect from ${this.serverName} because server is not initialized`);
        }
        await this._client.close();
        this._connected = false;
    }

    private async _listTools(): Promise<McpTools> {
        try {
            const clientTools = (await this._client.listTools()).tools;
            const mcpToolsArray = McpToolsArray.parse(clientTools);
            const tools = Object.fromEntries(mcpToolsArray.map((tool) => [tool.name, tool]));
            return tools;
        } catch (error) {
            logger.error("Error listing tools for " + this.serverName + ": " + error);
            return {};
        }
    }

    isConnected(): boolean {
        return this._connected;
    }

    private async setupAuthProvider() {
        const user = this.user;
        if (!user) {
            logger.error("No user found for user " + this._userId);
            return "UNAUTHORIZED";
        }
        if (!this.mcpServerAuth) {
            logger.debug("Creating new auth for server " + this._serverUrl);
            this.mcpServerAuth = {
                serverUrl: this._serverUrl,
                serverName: this.serverName,
            };
        }

        const stateData = {
            userId: this._userId,
            serverUrl: this._serverUrl,
        };
        const encodedState = Buffer.from(JSON.stringify(stateData)).toString("base64");
        const redirectUrl = getOrThrow("AUTH_REDIRECT_URL") + "?state=" + encodedState;
        this._authProvider = new SlackOAuthClientProvider(this._userId, this._serverUrl, redirectUrl);
    }

    async executeTool(toolName: string, toolArgs: Record<string, any>): Promise<any> {
        try {
            const result = await this._client.callTool({
                name: toolName,
                arguments: toolArgs,
            });
            return result;
        } catch (error) {
            // TODO: define error types
            logger.error("Error executing tool " + toolName + " for " + this.serverName + ": " + error);
            throw error;
        }
    }
}
