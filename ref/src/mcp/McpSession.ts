import logger from "../shared/logger.js";
import { z } from "zod";
import type { Tool } from "./Tool.js";
import { slackClient } from "../slack/slackClient.js";
import messageBuilder from "../slack/messageBuilder.js";
import { McpClient } from "./McpClient.js";
import { McpClientConfig } from "./McpClient.js";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";

export const McpConfig = z.object({
    mcpServers: z.record(z.string(), McpClientConfig),
});
export type McpConfig = z.infer<typeof McpConfig>;

export type ToolCallRequest = {
    toolName: string;
    toolArgs: Record<string, unknown>;
    toolCallResult: any;
    success: boolean;
};

// Correspond to a thread started with the slack Bot. It has its own sets of mcp clients.
export class McpSession {
    private _userId: string;
    private _threadTs: string;
    private _channelId: string;
    private _clients: Record<string, McpClient> = {}; // indexed by server name (from mcpConfig)
    private _tools: Record<string, { mcpClient: McpClient; tool: Tool }> = {};
    public connectMessageIds: Record<string, { messageTs: string; channelId: string }> = {};
    public listingToolsMessageIds: Record<string, { messageTs: string; channelId: string }> = {};
    constructor(userId: string, threadTs: string, channelId: string, mcpConfig: McpConfig) {
        this._userId = userId;
        this._threadTs = threadTs;
        this._channelId = channelId;
        Object.entries(mcpConfig.mcpServers).forEach(([name, config]) => {
            this._clients[name] = new McpClient(name, config, this._userId);
        });
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

    getClientByServerUrl(serverUrl: string): McpClient | undefined {
        return Object.values(this._clients).find((client) => client.serverUrl === serverUrl);
    }

    async disconnect(serverName: string) {
        if (!this._clients[serverName]) {
            logger.warn(`Server ${serverName} not found`);
            return;
        }
        await this._clients[serverName].disconnect();
    }

    get tools(): Tool[] {
        return Object.values(this._tools).map((tool) => tool.tool);
    }

    async start() {
        const initializingHeader = await slackClient.postBlocks(
            messageBuilder.initializingHeader(),
            this._threadTs,
            this._channelId,
        );
        const initializingHeaderId = { messageTs: initializingHeader.ts!, channelId: initializingHeader.channel! };
        for (const [name, client] of Object.entries(this._clients)) {
            const connectMessage = await slackClient.postBlocks(
                messageBuilder.connectingMessage(name),
                this._threadTs,
                this._channelId,
            );
            this.connectMessageIds[client.serverUrl] = {
                messageTs: connectMessage.ts!,
                channelId: connectMessage.channel!,
            };
        }
        for (const [name, client] of Object.entries(this._clients)) {
            await this.handleConnect(client);
        }
        await slackClient.updateMessage(
            messageBuilder.welcomeHeader(),
            initializingHeaderId.messageTs,
            initializingHeaderId.channelId,
        );
        const listToolsHeader = await slackClient.postBlocks(
            messageBuilder.checkingToolsHeader(),
            this._threadTs,
            this._channelId,
        );
        const listToolsHeaderId = { messageTs: listToolsHeader.ts!, channelId: listToolsHeader.channel! };
        for (const [name, client] of Object.entries(this._clients)) {
            const listToolMessage = await slackClient.postBlocks(
                messageBuilder.checkingServerToolMessage(client.serverName),
                this._threadTs,
                this._channelId,
            );
            this.listingToolsMessageIds[client.serverUrl] = {
                messageTs: listToolMessage.ts!,
                channelId: listToolMessage.channel!,
            };
        }

        for (const [name, client] of Object.entries(this._clients)) {
            await this.handleListTools(client);
        }

        await slackClient.updateMessage(
            messageBuilder.listToolsHeader(),
            listToolsHeaderId.messageTs,
            listToolsHeaderId.channelId,
        );

        logger.info("New MCP Session started for user " + this._userId);
    }

    async handleListTools(client: McpClient) {
        try {
            await client.listTools();
            for (const tool of Object.values(client.tools)) {
                const toolIndex = client.serverName + "-" + tool.name; // Avoid name collision with other servers. Cannot put "." in tools for openAi
                this._tools[toolIndex] = { mcpClient: client, tool };
            }
            await slackClient.updateMessage(
                messageBuilder.listToolsMessage(client.serverName, Object.values(client.tools)),
                this.listingToolsMessageIds[client.serverUrl]!.messageTs,
                this.listingToolsMessageIds[client.serverUrl]!.channelId,
            );
        } catch (error) {
            logger.error("Error listing tools for " + client.serverName, error);
        }
    }

    async handleConnect(client: McpClient) {
        try {
            const success = await client.connect();
            if (success) {
                await slackClient.updateMessage(
                    messageBuilder.connectedMessage(client.serverName),
                    this.connectMessageIds[client.serverUrl]!.messageTs,
                    this.connectMessageIds[client.serverUrl]!.channelId,
                );
            }
        } catch (error) {
            logger.warn("Error connecting to mcp server: " + client.serverName, error);
            await slackClient.updateMessage(
                messageBuilder.disconnectedMessage(client.serverName),
                this.connectMessageIds[client.serverUrl]!.messageTs,
                this.connectMessageIds[client.serverUrl]!.channelId,
            );
        }
    }

    async handleAuthCallback(serverUrl: string, authCode: string) {
        const client = this.getClientByServerUrl(serverUrl);
        if (!client) {
            return;
        }
        const authProvider = client.authProvider;
        if (!authProvider) {
            return;
        }

        await auth(authProvider, { serverUrl: serverUrl, authorizationCode: authCode });
        await this.handleConnect(client);
        await this.handleListTools(client);
    }

    async processToolCallRequest(toolCallRequest: ToolCallRequest): Promise<void> {
        try {
            const tool = this._tools[toolCallRequest.toolName];
            if (!tool) {
                throw new Error(`Tool ${toolCallRequest.toolName} not found`);
            }
            toolCallRequest.toolCallResult = await tool.mcpClient.executeTool(tool.tool.name, toolCallRequest.toolArgs);
            toolCallRequest.success = true;
        } catch (error) {
            logger.error(`Error executing tool ${toolCallRequest.toolName}: ${error}`);
            toolCallRequest.success = false;
        }
    }
}
