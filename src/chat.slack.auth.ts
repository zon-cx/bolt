import {InMemoryOAuthClientProvider} from "./mcp.auth.client";
import type {OAuthClientMetadata} from "@modelcontextprotocol/sdk/shared/auth.js";
import {env} from "node:process";
import {ServerResponse} from "node:http";
import {ParamsIncomingMessage} from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import {URL, URLSearchParams} from "node:url";
import {connectYjs} from "@/store.yjs.ts";
import * as Y from "yjs";
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {OAuthClientProvider, UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js';

import {
    CallToolRequest,
    ListToolsRequest,
    CallToolResultSchema,
    ListToolsResultSchema
} from '@modelcontextprotocol/sdk/types.js';
import {z} from "zod";
import {MCPClientConnection} from "@/gateway.mcp.client.ts";

const CALLBACK_URL = `${env.BASE_URL || "https://slack.cfapps.eu12.hana.ondemand.com"}/oauth/callback`; // Match Inspector/test


const authState = connectYjs("@mcp.slack");

export const connections = new Map<string, MCPClientConnection>();

export const authCallback =async (req: ParamsIncomingMessage, res: ServerResponse) => {
    try {
        const url = new URLSearchParams(req.url!.split("?")[1]);
        const authCode = url.get("code")!;
        const state = url.get("state")!;
        console.log("authCallback", state, authCode);
        InMemoryOAuthClientProvider.finishAuth(state, authCode);
 
        // const oauthProvider = InMemoryOAuthClientProvider.fromState(state);
        // const transport = new StreamableHTTPClientTransport(
        //   new URL(env.MCP_MANAGER_URL!),
        //   {
        //     authProvider: oauthProvider,
        //   }
        // );
        // await transport.finishAuth(authCode); 
        // const info = await oauthProvider.info();
        // const { id, name } = info!;
        // const connection = new MCPClientConnection(new URL(env.MCP_MANAGER_URL!), {
        //     id: id,
        //     info: {
        //       name: name,
        //       version: "1.0.0",
        //     },
        //     client: {
        //       capabilities: {},
        //     },
        //     transport: () => transport,
        //   });
        //   await connection.init();
        //   connections.set(id!, connection);
          

        // const auth = getClient(userId);
        // if (!auth) {
        //     return res.end(`MCP session not found ${auth ? "missing redirect callback" : "missing oauth provider"}`);
        // }

        // console.log("Handling auth callback for user " + id + " and serverUrl " + env.MCP_MANAGER_URL);
        // authState.getMap(id!).set("code", authCode);
        res.end("Callback successful!");
    } catch (error) {
        console.error("Error in callback handler:", error);
        res.end("Error in callback handler");
    }
};


export class SlackInteractiveOAuthClient {
    public client: Client | null = null;
     public connection: MCPClientConnection;
    constructor(
        private serverUrl: string,
        private userId: string,
        private sessionID: string,
        private say: (msg: any) => Promise<any>,
        private setStatus?: (status: string) => void,
        private setSuggestedPrompts?: (prompts: any) => void,
        private setTitle?: (title: string) => void,
        private authorizationMessage?: (msg: any) => Promise<any>
    ) {    
        const oauthProvider=this.getOAuthProvider();
       const baseUrl = new URL(this.serverUrl);
        this.connection = new MCPClientConnection(baseUrl, {
            id: this.sessionID,
            info: {
                 name: `slack-oauth-client-${this.userId}`,
                version: '1.0.0',
            },
            client: {
                
                capabilities: {},
            },
            transport:()=> new StreamableHTTPClientTransport(baseUrl, {
                authProvider: oauthProvider,
            })
        });

        this.connection.connectionState.subscribe(async (state) => {
            console.log(`Connection state changed to: ${state}`);
            if (state === 'ready') {
                this.client = this.connection.client;
                this.setStatus?.('Connected to MCP server');
                this.setTitle?.(`MCP Client - ${this.serverUrl}`);
                this.setSuggestedPrompts?.([]);
            } else if (state === 'authenticating') {
                this.setStatus?.('Authenticating with MCP server...');
          
            } else if (state === 'failed') {
                this.setStatus?.('Failed to connect to MCP server');
            }
        })
        

    }

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
        const onRedirect =async (authorizationUrl: URL) => {
             console.log("Redirecting to " + authorizationUrl.toString());

            await this.authorizationMessage?.( [
                    {type: "section", text: {type: "mrkdwn", text: "Welcome to MCP Chat :wave:"}},
                    {type: "divider"},
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: "To get started, connect to an MCP server using the button below.",
                        },
                    },
                    {type: "divider"}, {
                        type: "actions",
                        elements: [{
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: "Login with OAuth :lock:",
                                emoji: true,
                            },
                            url: authorizationUrl.toString(),
                            action_id: 'redirect',
                            style: "primary",
                        }],
                    }
                ],
            );
            if (this.setStatus) this.setStatus('Please authorize access to the MCP server.');
        };
        return new InMemoryOAuthClientProvider(CALLBACK_URL, clientMetadata, this.userId, onRedirect);
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
                        {type: 'section', text: {type: 'mrkdwn', text: '*Available tools:*'}},
                        ...result.tools.map((tool) => ({
                            type: 'section',
                            text: {
                                type: 'plain_text',
                                text: `${tool.name}${tool.description ? ' - ' + tool.description : ''}`
                            },
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
