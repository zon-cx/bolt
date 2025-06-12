import {env} from "node:process";
import slack from "@slack/bolt";
import {ActorRef, waitFor,} from "xstate";
import {fromMcpSession, Tools} from "./chat.handler.thread";
import yjsActor from "./chat.store";
import {AllAssistantMiddlewareArgs} from "@slack/bolt/dist/Assistant";
import messages from "./chat.slack.messages";
import {Chat} from "./chat";
import {serverConfig,} from "./gateway.mcp.connection.store";
import {trace} from "@opentelemetry/api";
import {authCallback, SlackInteractiveOAuthClient} from "./chat.slack.auth";
import {slackClient} from "../ref/src/slack/slackClient.ts";
import {WebClient} from "@slack/web-api";
import {AppHomeOpenedEvent} from "@slack/types";
import {z} from "zod";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const {App, LogLevel} = slack;
const {Assistant} = slack;
const tracer = trace.getTracer("console-tracer");
const log =
    (logger: slack.Logger) =>
        (...args: any[]) => {
            logger.info(...args);
        };

function listener(
    args: Pick<
        AllAssistantMiddlewareArgs,
        "say" | "setStatus" | "setSuggestedPrompts" | "setTitle"
    >
) {
    return function listene(
        actor: ActorRef<
            any,
            any,
            Chat.Messages.Event | Chat.Say.Event | Tools.Event
        >
    ) {
        const {say, setStatus, setSuggestedPrompts, setTitle} = args;

        actor.on("@message.assistant", (event) => {
            const {content} = event;
            say(content.toString());
        });
        actor.on("@chat.message", ({message}) => {
            say(message);
        });
        actor.on("@chat.blocks", ({blocks}) => {
            say({blocks});
        });
        actor.on("@chat.status", ({status}) => {
            setStatus(status);
        });
        actor.on("@chat.title", ({title}) => {
            setTitle(title);
        });
        actor.on("@chat.prompts", ({prompts}) => {
            setSuggestedPrompts({prompts});
        });
        actor.on("@tool.call", (event) => {
            console.log("tool call", event);
            say(messages.listTools("calling tool", [event.toolName]));

            // say(messages.toolRequest([{toolName:event.toolName, toolArgs:event.args as Record<string, unknown> }]));
        });
        actor.on("@tool.result", (event) => {
            console.log("tool result", event);
            // say(messages.toolResult([{toolName:event.toolName, toolArgs:event.args as Record<string, unknown> }]));
        });
        actor.on("@tool.available", (event) => {
            console.log("tool available", event);

            say(
                messages.listToolsMessage(
                    "available tools",
                    new Map(Object.entries(event.tools))
                )
            );
        });
    };
}

const slackMcpClients = new Map<string, SlackInteractiveOAuthClient>();

const assistant = new Assistant({
    /**
     * A custom ThreadContextStore can be provided, inclusive of methods to
     * get and save thread context. When provided, these methods will override the `getThreadContext`
     * and `saveThreadContext` utilities that are made available in other Assistant event listeners.
     */
    /*threadContextStore: {
      get: async ({ context, client, payload }) => {
      },
      save: async ({ context, client, payload }) => {
     }
    },*/

    /**
     * `assistant_thread_started` is sent when a user opens the Assistant container.
     * This can happen via DM with the app or as a side-container within a channel.
     * https://api.slack.com/events/assistant_thread_started
     */
    threadStarted: async ({
                              say,
                              getThreadContext,
                              setStatus,
                              setSuggestedPrompts,
                              setTitle,
                              saveThreadContext,
                              client,
                              event,
                              context,
                              logger,
                          }) => {
        const userId = event.assistant_thread.user_id;
        const id = event.assistant_thread.thread_ts;
        const ctx = await getThreadContext();
        console.log("thread context", ctx, context);
        let slackClient = slackMcpClients.get(userId);
        if (!slackClient) {
            slackClient = new SlackInteractiveOAuthClient(
                env.MCP_GATEWAY_URL!,
                userId,
                id,
                say,
                setStatus,
                setSuggestedPrompts,
                setTitle,
                (blocks)=>say({
                  blocks
                })
            );
            slackMcpClients.set(userId, slackClient);
            await slackClient.connect();
        }

        // const session= await getOrCreateMcpClient(event.assistant_thread.user_id,getOAuthProvider({say, setStatus, setSuggestedPrompts,setTitle, context}));
        const input = {
            bot: context,
            thread: event.assistant_thread,
        };
        logger.debug(
            "Thread started for user " +
            event.assistant_thread.user_id +
            " with thread ts " +
            event.assistant_thread.thread_ts
        );

        const assistant = await yjsActor(fromMcpSession(slackClient.client!), {
            input,
            doc: `@assistant/${id}`,
            logger: log(logger),
            onCreate: listener({say, setStatus, setSuggestedPrompts, setTitle}),
        }).start();

        waitFor(assistant, (state) => state.matches("listening")).then(() => {
            console.log("thread started", assistant.getPersistedSnapshot());
        });
    },

    /**
     * `assistant_thread_context_changed` is sent when a user switches channels
     * while the Assistant container is open. If `threadContextChanged` is not
     * provided, context will be saved using the AssistantContextStore's `save`
     * method (either the DefaultAssistantContextStore or custom, if provided).
     * https://api.slack.com/events/assistant_thread_context_changed
     */
    threadContextChanged: async ({logger, saveThreadContext}) => {
        await saveThreadContext().catch(logger.error);
    },

    /**
     * Messages sent to the Assistant do not contain a subtype and must
     * be deduced based on their shape and metadata (if provided).
     * https://api.slack.com/events/message
     */
    userMessage: async ({
                            message,
                            say,
                            ack,
                            setStatus,
                            setSuggestedPrompts,
                            setTitle,
                            logger,
                            context,
                        }) => {
        // Type guard for Slack message events
        let userId: string | undefined = undefined;
        if (
            typeof message === "object" &&
            "user" in message &&
            typeof message.user === "string"
        ) {
            userId = message.user;
        } else if (context && context.user && context.user.id) {
            userId = context.user.id;
        }
        if (!userId) {
            logger.error("No user ID found in message or context");
            return;
        }
        const id =
            ("thread_ts" in message && message.thread_ts) ||
            message.event_ts ||
            message.ts;

        let slackClient = slackMcpClients.get(userId);
        if (!slackClient) {
            slackClient = new SlackInteractiveOAuthClient(
                env.MCP_GATEWAY_URL!,
                userId,
                id,
                say,
                setStatus,
                setSuggestedPrompts,
                setTitle,
                (blocks)=>say({
                  blocks
                })
            );
            slackMcpClients.set(userId, slackClient);
            await slackClient.connect();
        }
        console.log("userMessage", message);
        const assistant = await yjsActor(fromMcpSession(slackClient.client!), {
            input: context,
            doc: `@assistant/${id}`,
            logger: log(logger),
            onCreate: listener({say, setStatus, setSuggestedPrompts, setTitle}),
        }).start();

        if ("text" in message && !!message.text && "user" in message) {
            console.log("sending message");
            assistant.send({
                timestamp: message.ts,
                role: "user",
                user: message.user,

                type: `@message.${message.subtype || "user"}`,
                content: message.text,
            });

            console.log("message sent", assistant.getPersistedSnapshot());
        }
    },
});
const port = parseInt(env.MCP_SERVER_PORT || "8080");

const ListConnectionsResultSchema = CallToolResultSchema.extend({
    connections: z.array(z.object({
        name: z.string(),
        url: z.string(),
        status: z.string(),
    })),
});
const app = new App({
    token: env.SLACK_BOT_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
    socketMode: true,
    // receiver: socketModeReceiver,
    appToken: env.SLACK_APP_TOKEN,
    logLevel: LogLevel.DEBUG,
    port: port,
    customRoutes: [
        {
            path: "/",
            method: "GET",
            handler: async (req, res) => {
                res.writeHead(200, {"Content-Type": "text/html"});
                res.end(
                    "<h1>Slack MCP Chat</h1><p>Install application <a>https://api.slack.com/apps/A08RC4RM7JN</a></p>"
                );
            },
        },
        {
            path: "/oauth/callback",
            method: "GET",
            handler: authCallback,
        },
    ]
});

app.assistant(assistant);



app.action(
    "connect",
    async ({ack, client, logger, body, action}) => {
        await ack();
        try {
            // Type guard to ensure we have a view
            if (!("view" in body) || !body.view) {
                throw new Error("No view found in action body");
            }

            const view = body.view;
            const url = view.state.values.mcp_server.url.value;
            const name = view.state.values.mcp_server_name.name.value;

            if (!url) {
                throw new Error("No URL provided");
            }


            const slackClient = getHomeSlackClient({
                user: body.user.id,
            }, client);
            await slackClient.connection.init();

            // Connect to the new server
            const result = await slackClient.callTool("connect",{
              url,
              name,
            });

            if (!result || result.isError) {
                throw new Error(
                    `Failed to connect to MCP server: ${
                        result?.content.map((e) => e.text) || "Unknown error"
                    }`
                );
            }

            // Get updated connections
            const listConnections = await slackClient.connection.client.callTool({
              name:"list-connections",
              arguments:{}
            });

            if (!listConnections || listConnections.isError) {
                throw new Error(
                    `Failed to list connections: ${
                        listConnections?.content.map((e) => e.text) || "Unknown error"
                    }`
                );
            }

            // Update the home view
            await client.views.update({
                view_id: view.id,
                hash: view.hash,
                view: {
                    type: "home",
                    blocks: buildServerBlocks(
                        listConnections.structuredContent?.connections as any || [],
                        body.user.id
                    ),
                },
            });
        } catch (error) {
            logger.error(error);
        }
    }
);

app.action(
    "disconnect",
    async ({ack, body, logger, action, client}) => {
        await ack();
        try {
            // Type guard to ensure we have a block action
            if (!("block_id" in action) || !("value" in action)) {
                throw new Error("Invalid action type");
            }

            const serverId = action.value as string;
            if (!serverId) {
                throw new Error("No server ID provided");
            }

            const slackClient = getHomeSlackClient({
                user: body.user.id,
            }, client);
            await slackClient.connection.init();
            logger.info(`Disconnecting from server: ${serverId}`);

            // Disconnect the server
            const result = await slackClient.callTool("disconnect", {
                id: serverId,
            });

            if (!result || result.isError) {
                throw new Error(
                    `Failed to disconnect from MCP server: ${
                        result?.content.map((e) => e.text) || "Unknown error"
                    }`
                );
            }

            // Get updated connections
            const listConnections = await slackClient.connection.client.callTool({
              name:"list-connections",
              arguments:{}
            });
            if (!listConnections || listConnections.isError) {
                throw new Error(
                    `Failed to list connections: ${
                        listConnections?.content.map((e) => e.text) || "Unknown error"
                    }`
                );
            }

            // Update the home view
            await client.views.publish({
                user_id: body.user.id,
                view: {
                    type: "home",
                    blocks: buildServerBlocks(
                        listConnections.structuredContent?.connections as any || [],
                        body.user.id
                    ),
                },
            });
        } catch (error) {
            logger.error(error);
            // await updateHomeViewWithMessage(
            //   client,
            //   body.user.id,
            //   `Failed to disconnect: ${error}`,
            //   true
            // );
        }
    }
);


// Update app_home_opened event handler
app.event("app_home_opened", async ({event, client, logger}) => {
    try {
        const slackClient = getHomeSlackClient(event, client);

        await slackClient.connection.init();
        console.log("slackClient", slackClient);


        // Get connections
        const listConnections = await slackClient.connection.client.callTool({
          name:"list-connections",
          arguments:{}
        });
        console.log(
            "listConnections",
            listConnections.isError
                ? listConnections.content.map((e) => e.text)
                : listConnections.structuredContent?.connections
        );
        if (!listConnections || listConnections.isError) {
            throw new Error(
                `Failed to list connections: ${
                    listConnections?.content.map((e) => e.text) || "Unknown error"
                }`
            );
        }

        // Call views.publish with the built-in client
        const result = await client.views.publish({
            user_id: event.user,
            view: {
                type: "home",
                blocks: buildServerBlocks(
                    listConnections.structuredContent?.connections as any || [],
                    event.user
                ),
            },
        });

        logger.info(result);
    } catch (error) {
        logger.error("Error publishing home view:", error);
        await client.views.publish({
            user_id: event.user,
            view: {
                type: "home",
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `Failed to load MCP connections: ${error}`,
                        },
                    },
                ],
            },
        })
    }
});



function getHomeSlackClient(event: { user: string }, client: WebClient) {
    const msgs: any[] = [];
    // const channel=client.conversations.open({
    //   users: event.user,
    //   return_im: true,
      
    // })
    let channel=event.user;
    let ts=undefined as string | undefined;
    // if(!channel.ok) throw new Error("Failed to open channel");
    return slackMcpClients.get(event.user) || slackMcpClients.set(
        event.user,
        new SlackInteractiveOAuthClient(
            env.MCP_MANAGER_URL!,
            event.user,
            event.user,
            async (msg) => {
                console.log("msg", msg);
                const result = await client.chat.postMessage({
                  channel: channel,
                  blocks:   typeof msg === "string" ? [{
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: msg,
                    },
                  }] : msg.blocks,
                 })
                 if(!result.ok)  console.error("Failed to post message", result);
                 channel=result?.channel || channel;
                 ts=result?.ts || ts;
                 return result;
            },
            async (status) => {
                console.log("status", status);
            },
            async (prompts)=>{
              console.log("prompts", prompts);
            },
            async (title)=>{
              console.log("title", title);
            },
            async (msg)=>  await client.views.publish({
              user_id: event.user,
              view: {
                  type: "home",
                  blocks: msg
              },
          })
        )
    ).get(event.user)!;
}

function buildServerBlocks(
    connections: Array<serverConfig & { status: string }>,
    user: string
) {
    // Check if user is logged in by checking if they have any connections

    return [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*MCP Server:* " + `${env.MCP_GATEWAY_URL}`,
            },
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*MCP Dashboard:* " + `${env.MCP_DASHBOARD_URL}/agents/${user}`,
            },
        },
        {type: "divider"},
        {
            type: "section",
            text: {type: "mrkdwn", text: "*Connected Servers*"},
        },
        ...(connections.length === 0
            ? [
                {
                    type: "context",
                    elements: [{type: "mrkdwn", text: "No servers connected."}],
                },
            ]
            : connections.map(({id, url, status}) => ({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${id}*\n${url}\nStatus: ${status || "disconnected"}`,
                },
                accessory: {
                    type: "button",
                    text: {type: "plain_text", text: "Remove", emoji: true},
                    style: "danger",
                    value: id,
                    action_id: "disconnect",
                },
            }))),
        {type: "divider"},
        {
            type: "section",
            text: {type: "mrkdwn", text: "*Add New Server*"},
        },
        {
            type: "input",
            block_id: "mcp_server",
            element: {
                type: "url_text_input",
                action_id: "url",
                initial_value: "https://mcpagent.val.run/mcp",
                placeholder: {
                    type: "plain_text",
                    text: "Enter the MCP server URL",
                },
            },
            label: {
                type: "plain_text",
                text: "Server URL",
            },
        },
        {
            type: "input",
            block_id: "mcp_server_name",
            element: {
                type: "plain_text_input",
                action_id: "name",
                initial_value: "agent",
                placeholder: {
                    type: "plain_text",
                    text: "Server Name",
                },
            },
            label: {
                type: "plain_text",
                text: "Server Name",
            },
        },
        {
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: {type: "plain_text", text: ":add:", emoji: true},
                    action_id: "connect"
                },
            ],
        },
    ];
}

(async () => {
    // Start your app
    await app.start(port);

    app.logger.info("⚡️ Bolt app is running!" + ` on port ${port} with ${env.MCP_GATEWAY_URL} MCP Server URL`);
})();

