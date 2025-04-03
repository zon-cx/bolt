import logger from "../shared/logger.js";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";

import type { McpClientConfig, McpTools } from "./mcp.types.js";
import { McpToolsArray } from "./mcp.types.js";
import { Tool } from "./Tool.js";
import { SlackOAuthClientProvider } from "./SlackOauthClientProvider.js";
import { McpSession } from "../slack/McpSession.js";
import { mcpSessionStore } from "../slack/mcpSessionStore.js";

import type { UserSession, McpServerAuth } from "../shared/userSessionStore.js";
import { userSessionStore } from "../shared/userSessionStore.js";

export class McpClient {
    private _config: McpClientConfig;
    private _transport: SSEClientTransport | StdioClientTransport | null;
    private _client: Client;
    private _connected: boolean = false;
    private _sessionId: string;
    private _userId: string;
    private _serverUrl: string;
    public connectMessageId: { messageTs: string; channelId: string } | null = null;
    public serverName: string;
    public tools: Record<string, Tool> = {};

    constructor(serverName: string, config: McpClientConfig, sessionId: string, userId: string) {
        this.serverName = serverName;
        this._config = config;
        this._sessionId = sessionId;
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
    }

    get clientId(): string {
        return this._sessionId + "_" + this.serverName;
    }

    get mcpSession(): McpSession | undefined {
        return mcpSessionStore.getById(this._sessionId);
    }

    get userSession(): UserSession | undefined {
        return userSessionStore.get(this._userId);
    }

    get mcpServerAuth(): McpServerAuth | undefined {
        const userSession = this.userSession;
        if (!userSession) {
            return undefined;
        }
        return userSession.mcpServerAuths[this.serverName];
    }

    async connect() {
        if (this._connected) {
            logger.warn("MCP client " + this.serverName + " is already connected");
            return;
        }
        try {
            logger.info(
                "Connecting to MCP server " + this.serverName + " with config: " + JSON.stringify(this._config),
            );
            if ("url" in this._config && this._config.url.endsWith("/sse")) {
                this._transport = new SSEClientTransport(new URL(this._config.url));
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
        } catch (error) {
            const retry = await this.handleAuthError(error);
            if (retry) {
                //TODO this needs to be handled better
                await this.connect();
            }
            if (error instanceof SseError && error.code === 401) {
                return;
            }
            throw error;
        }
    }

    async handleAuthError(error: unknown) {
        //if (error instanceof SseError && error.code === 401) {
        if (error instanceof SseError && error.code === 403) {
            const userSession = this.userSession;
            if (!userSession) {
                logger.error("No user session found for user " + this._userId);
                return false;
            }
            if (this.mcpServerAuth) {
                logger.debug(
                    "Mcp server auth found in user session " + this._userId + " for server " + this.serverName,
                );
                // TODO: handle that
                return false;
            }
            logger.debug("Creating new auth for server " + this._serverUrl);
            // TODO delete that at the end of the auth process ?
            userSession.mcpServerAuths[this._serverUrl] = {
                serverUrl: this._serverUrl,
                serverName: this.serverName,
            };
            userSessionStore.update(this._userId, userSession);
            const authProvider = new SlackOAuthClientProvider(this._userId, this._serverUrl);
            const result = await auth(authProvider, { serverUrl: this._serverUrl });
            return result === "AUTHORIZED";
        }
        return false;
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
