import { InMemoryOAuthClientProvider } from "./mcp.auth.client";
import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { env } from "node:process";
import {  ServerResponse } from "node:http";
import { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import {URL, URLSearchParams} from "node:url";
import {connectYjs} from "@/store.yjs.ts";
import * as Y from "yjs";
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OAuthClientProvider, UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';

import {
    CallToolRequest,
    ListToolsRequest,
    CallToolResultSchema,
    ListToolsResultSchema
} from '@modelcontextprotocol/sdk/types.js';
import {z} from "zod";

const CALLBACK_URL = `${env.BASE_URL || "https://slack.cfapps.eu12.hana.ondemand.com"}/oauth/callback`; // Match Inspector/test


const authState = connectYjs("@mcp.slack");


export const authCallback = (getClient: (userId: string) => SlackInteractiveOAuthClient | undefined) => async (req: ParamsIncomingMessage, res: ServerResponse) => {
    try {
        console.log("authCallback",);
        const url = new URLSearchParams(req.url!.split("?")[1]);
        const authCode = url.get("code");
        const encodedState = url.get("state");

        if (!authCode || !encodedState) {
            return res.end("Wrong request");
        }

        if (typeof authCode !== "string") {
            return res.end("Invalid authorization code");
        }

        let stateData;
        try {
            const decodedState = Buffer.from(encodedState as string, "base64").toString("utf-8");
            stateData = JSON.parse(decodedState);
        } catch (error) {
            console.error("Error decoding state parameter:", error);
            return res.end("Invalid state parameter");
        }

        const userId = stateData.userId;
        const serverUrl = stateData.serverUrl;
        const sessionId = stateData.sessionId || "default";

        if (!userId || !serverUrl) {
            return res.end("Wrong request");
        }

        // const auth = getClient(userId);
        // if (!auth) {
        //     return res.end(`MCP session not found ${auth ? "missing redirect callback" : "missing oauth provider"}`);
        // }
      
        console.log("Handling auth callback for user " + userId + " and serverUrl " + serverUrl);
        authState.getMap(sessionId).set("code", authCode);
        res.end("Callback successful!");
    } catch (error) {
        console.error("Error in callback handler:", error);
        res.end("Error in callback handler");
    }
};

 
export class SlackInteractiveOAuthClient {
    public client: Client | null = null;
    private oauthProvider: InMemoryOAuthClientProvider | null = null;

    constructor(
        private serverUrl: string,
        private userId: string,
        private sessionID: string,
        private say: (msg: any) => Promise<any>,
        private setStatus?: (status: string) => void,
        private setSuggestedPrompts?: (prompts: any) => void,
        private setTitle?: (title: string) => void
    ) {}

    private getOAuthProvider(): InMemoryOAuthClientProvider {
        const clientMetadata: OAuthClientMetadata = {
            client_name: 'Slack MCP Client',
            redirect_uris: [CALLBACK_URL],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            //   token_endpoint_auth_method: 'none',
            scope: 'openid profile email',
            //   client_uri: 'https://github.com/modelcontextprotocol/inspector',
        };
        // Slack-specific redirect handler: send a Slack message with an authorize button
        const onRedirect = (authorizationUrl: URL) => {
            const state = Buffer.from(JSON.stringify({userId: this.userId, serverUrl: this.serverUrl, sessionId:this.sessionID})).toString('base64');
            authorizationUrl.searchParams.set('state', state);
            console.log("Redirecting to " + authorizationUrl.toString());

            this.say({
                blocks: [
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `*MCP Server* requires authorization ⚠️` },
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                text: { type: 'plain_text', text: 'Authorize' },
                                url: authorizationUrl.toString(),
                                action_id: 'redirect',
                                value:  'authorize',
                            },
                        ],
                    },
                ],
                text: 'MCP Server requires authorization ⚠️',
            });
            if (this.setStatus) this.setStatus('Please authorize access to the MCP server.');
        };
        return new InMemoryOAuthClientProvider(CALLBACK_URL, clientMetadata, onRedirect);
    }

    private async attemptConnection(): Promise<void> {
        if (!this.oauthProvider) throw new Error('OAuth provider not initialized');
        const baseUrl = new URL(this.serverUrl);
        const transport = new StreamableHTTPClientTransport(baseUrl, {
            authProvider: this.oauthProvider,
        });
        try {
            await this.client!.connect(transport);
            console.log('✅ Connected successfully to MCP server:', this.serverUrl);
            await this.say(':white_check_mark: Connected to MCP server!');
        } catch (error) {
            if (error instanceof UnauthorizedError) {
                await this.say(':lock: Authorization required. Please click the button above to authorize.');
                // Wait for the callback to resolve the code 
                const code = await new Promise<string>((resolve, reject) => {
                        const callback = (event: Y.YMapEvent<string>) => {
                            console.log(`🔐 Ymap event received:`, Array.from(event.keysChanged.keys()));
                            if (event.keysChanged.has('code')) {
                                const code = authState.getMap<string>(this.sessionID).get('code');
                                if (code) {
                                    console.log(`🔐 Authorization code received: ${code.substring(0, 10)}...`);
                                    authState.getMap<string>(this.sessionID).unobserve(callback);
                                    resolve(code);
                                } else {
                                    console.error('❌ No authorization code found in session state');
                                    reject(new Error('No authorization code found'));
                                }
                            }
                        };
                        authState.getMap<string>(this.sessionID).observe(callback);
                    }
                );
                await transport.finishAuth(code);
                console.log('🔐 Authorization complete, reconnecting...');
                await this.attemptConnection();
            } else {
                console.error('❌ Connection failed with non-auth error:', error,"serverUrl", this.serverUrl);
                await this.say(`:x: Connection failed: ${error}`);
                throw error;
            }
        }
    }

    async connect(): Promise<Client> {
        this.oauthProvider = this.getOAuthProvider();
        this.client = new Client({
            name: `slack-oauth-client-${this.userId}`,
            version: '1.0.0',
        }, { capabilities: {} });
        await this.say(':arrows_counterclockwise: Connecting to MCP server...');
        await this.attemptConnection();
        return this.client;
    }

    async listTools(): Promise<void> {
        if (!this.client) {
            await this.say(':x: Not connected to server');
            return;
        }
        try {
            const request: ListToolsRequest = {
                method: 'tools/list',
                params: {},
            };
            const result = await this.client.request(request, ListToolsResultSchema);
            if (result.tools && result.tools.length > 0) {
                await this.say({
                    blocks: [
                        { type: 'section', text: { type: 'mrkdwn', text: '*Available tools:*' } },
                        ...result.tools.map((tool) => ({
                            type: 'section',
                            text: { type: 'plain_text', text: `${tool.name}${tool.description ? ' - ' + tool.description : ''}` },
                        })),
                    ],
                    text: 'Available tools',
                });
            } else {
                await this.say('No tools available');
            }
        } catch (error) {
            await this.say(`:x: Failed to list tools: ${error}`);
        }
    }

    async callTool(toolName: string, toolArgs: Record<string, unknown>): Promise<z.infer<typeof CallToolResultSchema>> {
        if (!this.client) {
            await this.say(':x: Not connected to server');
            return Promise.reject(new Error('Not connected to server'));
        }
        try {
            const request: CallToolRequest = {
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: toolArgs,
                },
            };
            const result = await this.client.request(request, CallToolResultSchema);
            if (result.content) {
                for (const content of result.content) {
                    if (content.type === 'text') {
                        await this.say(content.text);
                    } else {
                        await this.say(JSON.stringify(content));
                    }
                }
            } else {
                await this.say(JSON.stringify(result));
            }
            return result;
        } catch (error) {
            await this.say(`:x: Failed to call tool '${toolName}': ${error}`);
           throw error;
        }
    }
}
