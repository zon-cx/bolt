import {env} from "node:process";
import slack from "@slack/bolt";
import {ActorRef, ActorRefFromLogic, createActor, waitFor} from "xstate";
import {fromMcpSession} from "./chat.handler.thread.ts";
import yjsActor from "./chat.store.ts";
import {AllAssistantMiddlewareArgs} from "@slack/bolt/dist/Assistant";
import messages from "./chat.ui.slack.messages.ts";
import {Session, Tools} from "./chat.type.ts";
import {type serverConfig} from "./registry.identity.store.ts";
import {trace} from "@opentelemetry/api";
import {InMemoryOAuthClientProvider} from "./mcp.client.auth.ts";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {CallToolResult} from "@modelcontextprotocol/sdk/types.js";
import mcpClientMachine from "./mcp.client.ts";

const { App, LogLevel } = slack;
const { Assistant } = slack;
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
    actor: ActorRef<any, any, Session.Event>
  ) {
    const { say, setStatus, setSuggestedPrompts, setTitle } = args;
 
    actor.on("@chat.message", async ({ message }) => {
     await say(message);
    });
    actor.on("@chat.blocks", async ({ blocks }) => {
      await say({ blocks });
    });
    actor.on("@chat.status", async ({ status }) => {
      await  setStatus(status);
    });
    actor.on("@chat.title", async ({ title }) => {
      await  setTitle(title);
    });
    actor.on("@chat.prompts",async ({ prompts }) => {
      await setSuggestedPrompts({ prompts });
    });
    actor.on("@tool.call",async (event) => {
      console.log("tool call", event);
      await say(messages.listTools("calling tool", [event.toolName]));

      // say(messages.toolRequest([{toolName:event.toolName, toolArgs:event.args as Record<string, unknown> }]));
    });
    actor.on("@tool.result", async (event) => {
      console.log("tool result", event);
      // say(messages.toolResult([{toolName:event.toolName, toolArgs:event.args as Record<string, unknown> }]));
    });
    actor.on("@tool.available", async (event) => {
      console.log("tool available", event);

     await say(
        messages.listToolsMessage(
          "available tools",
          new Map(Object.entries(event.tools))
        )
      );
    });
  };
}


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
    await setStatus("connecting...");

    const ctx = await getThreadContext();
    console.log("thread context", ctx, context);
    const oauthProvider = slackOAuthProvider(userId);
    await setStatus("connecting...");
    oauthProvider.authorizationUrl.subscribe(async (url) => {
     await setStatus("authorizing...");

      const result = await say({
        blocks: messages.loginMessage(url?.toString() || ""),
      });
      await oauthProvider.save("permalink", await client.chat.getPermalink({
        channel: event.assistant_thread.channel_id,
        message_ts: result.ts || event.assistant_thread.thread_ts
       }))
      await  setStatus("connecting...");
    });
    const connection = await mcpConnection({
      oauthProvider,
      client,
      server: new URL(env.MCP_GATEWAY_URL!),
      user: userId,
    });
    console.log("thread started", connection.getSnapshot().value);

     await waitFor(connection, (state) => state.matches("ready"));
    await setStatus("connected...");
      logger.debug(
        "Thread started for user " +
          event.assistant_thread.user_id +
          " with thread ts " +
          event.assistant_thread.thread_ts
      );
      
      const assistant = await yjsActor(fromMcpSession(connection), {
        input:{
            bot: context,
            thread: event.assistant_thread,
          },
        doc: `@assistant/${id}`,
        logger: log(logger),
        onCreate: listener({ say, setStatus, setSuggestedPrompts, setTitle }),
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
  threadContextChanged: async ({ logger, saveThreadContext, context, event }) => {
    await saveThreadContext().catch(logger.error);
 
  },

  /**
   * Messages sent to the Assistant do not contain a subtype and must
   * be deduced based on their shape and metadata (if provided).
   * https://api.slack.com/events/message
   */
  userMessage: async ({
    message,
    client,
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
    await  setStatus("connecting...");
    const oauthProvider = slackOAuthProvider(userId);
    oauthProvider.authorizationUrl.subscribe(async (url) => {
     const result = await say({
        blocks: messages.loginMessage(url?.toString() || ""),
      });
       await oauthProvider.save("permalink", await client.chat.getPermalink({
        channel: message.channel,
        message_ts: result.message?.ts || result.ts || message.ts
       }))
    });
    const connection = await mcpConnection({
      oauthProvider,
      client,
      server: new URL(env.MCP_GATEWAY_URL!),
      user: userId,
    });
    await waitFor(connection, (state) => state.matches("ready"));
    await setStatus("connected...");
    console.log("userMessage", message);
    const assistant = yjsActor(fromMcpSession(connection), {
      input: context,
      doc: `@assistant/${id}`,
      logger: log(logger),
      onCreate: listener({ say, setStatus, setSuggestedPrompts, setTitle }),
    });

    if ("text" in message && !!message.text && "user" in message) {
      console.log("sending message");
      await assistant.send({
        //@ts-ignore
        timestamp: message.ts,
        role: "user",
        user: message.user,

        type: `@message.${message.subtype || "user"}`,
        content: message.text,
      });

    }
  },
});
const port = parseInt(env.PORT || "8080");

 
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
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<div >
          <h1>Slack MCP Chat</h1>
          <a href="https://slack.com/oauth/v2/authorize?client_id=${env.SLACK_BOT_CLIENT_ID}&scope=app_mentions:read,assistant:write,bookmarks:read,calls:read,calls:write,canvases:read,canvases:write,channels:history,channels:join,channels:read,channels:write.invites,chat:write,chat:write.customize,commands,dnd:read,emoji:read,files:read,files:write,groups:history,groups:read,groups:write,groups:write.invites,groups:write.topic,im:history,im:read,im:write,im:write.topic,incoming-webhook,links:read,metadata.message:read,mpim:history,mpim:read,mpim:write,mpim:write.topic,pins:read,reactions:read,reactions:write,users:read,users:write,workflow.steps:execute,workflows.templates:read,workflows.templates:write,links.embed:write,links:write,usergroups:write&user_scope=">
            <img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" />
            </a>
            </div>`
        );
      },
    },
    {
      path: "/oauth/callback",
      method: "GET",
      handler: async  function (req, res) { 
        console.log("authCallback", req.url);
        const url = new URLSearchParams(req.url!.split("?")[1]);
        const authCode = url.get("code")!;
        const state = url.get("state")!;
        console.log("authCallback", state, authCode);
        const authState = InMemoryOAuthClientProvider.finishAuth(state, authCode); 
         if(authState.has("permalink")){
            console.log("authState.get(permalink)", authState.get("permalink"));
            res.setHeader("Location", authState.get("permalink")!);
         }else{
            res.setHeader("Location", `https://slack.com/app_redirect?app=${env.SLACK_BOT_APP_ID}`);
         }
         res.statusCode = 302;
         res.end();
      },
    },
  ],
});

app.event("message", async ({ event, client, logger }) => {
  console.log("message!#", event);
});

app.assistant(assistant);

app.action("connect", async ({ ack, client, logger, body, action }) => {
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

    const connection = await mcpConnection({
      oauthProvider: slackOAuthProvider(body.user.id),
      client,
      server: new URL(env.MCP_GATEWAY_URL!),
      user: body.user.id,
    });
    await waitFor(connection, (state) => state.matches("ready"));
    // Connect to the new server
    const result = await connection.getSnapshot().context.client!.callTool(  {
      name: "@registry:connect",
      arguments: {
        url,
        name,
      },
    }) as CallToolResult & { content:{text:string}[]}

    if (!result || result.isError) {
      throw new Error(
        `Failed to connect to MCP server: ${
          result?.content.map((e) => e.text) || "Unknown error"
        }`
      );
    }
    await publishHome({
      connection,
      client,
      user: body.user.id,
    }); 

   
  } catch (error) {
    logger.error(error);
  }
});

app.action("disconnect", async ({ ack, body, logger, action, client }) => {
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
    const connection = await mcpConnection({
      oauthProvider: slackOAuthProvider(body.user.id),
      client,
      server: new URL(env.MCP_GATEWAY_URL!),
      user: body.user.id,
    });
    logger.info(`Disconnecting from server: ${serverId}`);
    await waitFor(connection, (state) => state.matches("ready"));
    // Disconnect the server
    const result = await connection.getSnapshot().context.client!.callTool({
      name: "@registry:disconnect",
      arguments: {
        id: serverId,
      },
    }) as CallToolResult & { content:{text:string}[]}

    if (!result || result.isError) {
      throw new Error(
        `Failed to disconnect from MCP server: ${
          result?.content.map((e) => e.text) || "Unknown error"
        }`
      );
    }
    await publishHome({
      connection,
      client,
      user: body.user.id,
    }); 
  } catch (error) {
    logger.error(error);
   
  }
});

// Update app_home_opened event handler
app.event("app_home_opened", async ({ event, client, logger }) => {
  const user = event.user;
  const oauthProvider = slackOAuthProvider(user);
 
  oauthProvider.authorizationUrl.subscribe(async (url) => {
    await client.views.publish({
      user_id: event.user,
      view: {
        type: "home",
        blocks: messages.loginMessage(url?.toString() || ""),
      },
    });
  });
  try { 
    await publishHome({
      connection: await mcpConnection({
        oauthProvider,
        client,
        server: new URL(env.MCP_GATEWAY_URL!),
        user: user,
      }),
      client,
      user: event.user,
    });
  } catch (error:any) {
    logger.error("Error publishing home view:", error);
    await client.chat.postMessage({
      channel: event.user,
       blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Failed to load MCP connections: ${error}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "```" + error.stack + "```",
          },
        },
      ],
    });
  }
});

const connections = new Map<string, ActorRefFromLogic<typeof mcpClientMachine>>();
async function mcpConnection({
  oauthProvider,
  client,
  server,
  user,
}: {
  oauthProvider: InMemoryOAuthClientProvider;
  client: slack.webApi.WebClient;
  server: URL;
  user: string;
}): Promise<ActorRefFromLogic<typeof mcpClientMachine>> {
  if (
    connections.has(user)
  ) {
    return connections.get(user)!;
  }

  const connection = createActor(mcpClientMachine, {
    id: oauthProvider.id,
    input: {
      url: server,
      options: {
        info: {
          name: "Slack MCP Client",
          version: "1.0.0",
        },
        authProvider: oauthProvider,
        session: oauthProvider.id,
      },
    },
  });

  connection.subscribe(async (state) => {
    if(state.matches("failed")){
      console.error("Failed to connect to MCP server", state.context.error);
      await client.chat.postMessage({
        channel: user,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Failed to connect to MCP server: ${
                state.context.error?.message
              }`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "```" + state.context.error?.stack + "```",
            },
          },
        ],
      });
    }
  });
  connection.subscribe(async (state) => {
    console.log("connection state", state.value);
    if(state.matches("authenticating")){
      console.log("authenticating");
      const authCode = await oauthProvider.waitForCode();
      // await new StreamableHTTPClientTransport(new URL(env.MCP_GATEWAY_URL!), {
      //   authProvider: oauthProvider,
      // }).finishAuth(authCode);
      await oauthProvider.tokensAsync();
      connection.send({type:"reconnect"});

    }
  });
  
 

  connection.start();
  connections.set(user, connection);

  await waitFor(connection, (state) => state.matches("ready"));
  connection.send({type:"ping"}); 

  return connection;
}
const CALLBACK_URL = `${
  env.BASE_URL || "https://slack.cfapps.eu12.hana.ondemand.com"
}/oauth/callback`; // Match Inspector/test

const oauthProviders = new Map<string, InMemoryOAuthClientProvider>();

function slackOAuthProvider(user: string): InMemoryOAuthClientProvider {
  return oauthProviders.get(user) ||
      oauthProviders
          .set(
              user,
              new InMemoryOAuthClientProvider(
                  CALLBACK_URL,
                  {
                    client_name: "Slack MCP Client",
                    redirect_uris: [CALLBACK_URL],
                    grant_types: ["authorization_code", "refresh_token"],
                    response_types: ["code"],
                    scope: "openid profile email agent",
                  },
                  user
              )
          )
          .get(user)!;
}

async function publishHome({
  connection,
  client,
  user,
}: {
  connection: ActorRefFromLogic<typeof mcpClientMachine>;
  client: slack.webApi.WebClient;
  user: string;
}) {
    await waitFor(connection, (state) => state.matches("ready"));

    const {structuredContent:info, content:infoContent} = await connection.getSnapshot().context.client!.callTool({
      name: "@registry:info",
      arguments: {},
    }) as CallToolResult & {structuredContent:{id:string, name:string, version:string, url:string, connections:number} }
    console.log("info", info);

    // Get connections
    const {isError, content, structuredContent:{connections}} = await connection.getSnapshot().context.client!.callTool({
      name: "@registry:list",
      arguments: {},
    }) as CallToolResult & {structuredContent:{connections: (serverConfig & {status:string})[] }, content:{text:string}[]}

    console.log(
      "listConnections",
      isError
        ? content.map((e:any) => e.text)
        : connections
    );
    if (isError) {
      throw new Error(
        `Failed to list connections: ${
          content.map((e:any) => e.text) || "Unknown error"
        }`
      );
    }

   await client.views.publish({
      user_id: user,
      view: {
        type: "home",
        blocks: buildServerBlocks(
          connections,
          info,
          user
        ),
      },
    });
  }

  function buildServerBlocks(
    connections: Array<serverConfig & { status: string }>,
    {
      id,
      name,
      version,
      url,
    }: { id: string; name: string; version: string; url: string },
    user: string
  ) {
    // Check if user is logged in by checking if they have any connections
  
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*MCP Server:* " + `${url}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*MCP Dashboard:* " + `${env.MCP_DASHBOARD_URL}/agents/${id}`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Connected Servers*" },
      },
      ...(connections.length === 0
        ? [
            {
              type: "context",
              elements: [{ type: "mrkdwn", text: "No servers connected." }],
            },
          ]
        : connections.map(({ id, url, status }) => ({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${id}*\n${url}\nStatus: ${status || "disconnected"}`,
            },
            accessory: {
              type: "button",
              text: { type: "plain_text", text: "Remove", emoji: true },
              style: "danger",
              value: id,
              action_id: "disconnect",
            },
          }))),
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Add New Server*" },
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
            text: { type: "plain_text", text: ":add:", emoji: true },
            action_id: "connect",
          },
        ],
      },
    ];
  }

 


(async () => {
  // Start your app
  await app.start(port);

  app.logger.info(
    "⚡️ Bolt app is running!" +
      ` on port ${port} with ${env.MCP_GATEWAY_URL} MCP Server URL`
  );
})();
