import { env } from "node:process";
import slack from '@slack/bolt'; 
const { App, LogLevel } = slack; 
import {
  ActorRefFromLogic,
  assertEvent,
  createActor,
  EventObject,
  fromCallback,
  waitFor,
  ActorRefLike,
  ActorRef
} from "xstate";
const { Assistant } = slack;
import {Client as McpClient} from "@modelcontextprotocol/sdk/client/index.js";
import sessionMachine, { fromMcpSession } from "./chat.handler.thread";
import yjsActor from "./chat.store";
import { AllAssistantMiddlewareArgs } from "@slack/bolt/dist/Assistant";
import messages from "./chat.slack.messages";
import { Chat } from "./chat";
import { Tools } from "./chat.handler.thread";
import { getOrCreateMcpAgent } from "./gateway.mcp.connection.store";
import {type MCPClientManager } from "./gateway.mcp.connection";
import { MCPClientConnection } from "./gateway.mcp.client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { aiTools } from "./chat.mcp.client";
import { experimental_createMCPClient, generateText, smoothStream, streamText } from "ai";
import { azure } from "@ai-sdk/azure";
import { trace } from  '@opentelemetry/api';
const tracer = trace.getTracer('console-tracer');

  const log=(logger:slack.Logger) => (...args:any[])=>{
   logger.info(...args);
 }
 
 function listener(args:Pick<AllAssistantMiddlewareArgs,"say" | "setStatus" | "setSuggestedPrompts" | "setTitle"   >){
  return function listene(actor:ActorRef<any,any,Chat.Messages.Event | Chat.Say.Event| Tools.Event>){
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

    say(messages.listToolsMessage("available tools", new Map(Object.entries(event.tools))));

  });
}
  
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
  threadStarted: async ({say, setStatus, setSuggestedPrompts,setTitle, saveThreadContext, client,event, context, logger}) => {
    const id= event.assistant_thread.thread_ts;

    const session= await getOrCreateMcpClient(event.assistant_thread.user_id);
    const input= {
      bot: context,
      thread: event.assistant_thread,
     }
    logger.debug(
      "Thread started for user " +
          event.assistant_thread.user_id +
          " with thread ts " +
          event.assistant_thread.thread_ts,
     );

    const assistant = await yjsActor(fromMcpSession(session),{
          input,
          doc: `@assistant/${id}`,
          logger: log(logger),
          onCreate: listener({say, setStatus, setSuggestedPrompts, setTitle})
        }).start();

   
    waitFor(assistant, (state) => state.matches("listening")).then(()=>{
      console.log("thread started",assistant.getPersistedSnapshot());
     }) 
    
    

  },

  /**
   * `assistant_thread_context_changed` is sent when a user switches channels
   * while the Assistant container is open. If `threadContextChanged` is not
   * provided, context will be saved using the AssistantContextStore's `save`
   * method (either the DefaultAssistantContextStore or custom, if provided).
   * https://api.slack.com/events/assistant_thread_context_changed
   */
  threadContextChanged: async ({ logger, saveThreadContext }) => {
    await saveThreadContext().catch(logger.error)
  },

  /**
   * Messages sent to the Assistant do not contain a subtype and must
   * be deduced based on their shape and metadata (if provided).
   * https://api.slack.com/events/message
   */
  userMessage: async ( {message, say, ack, setStatus, setSuggestedPrompts, setTitle, logger, context}) => {
    const id = ("thread_ts" in message && message.thread_ts) || message.event_ts || message.ts;
    console.log("userMessage",message); 
    // setStatus("thinking...");
    // ack && await ack();
    
    const assistant =await yjsActor(fromMcpSession(await getOrCreateMcpClient(message.user)),{
      input: context,
      doc: `@assistant/${id}`,
      logger: log(logger),
      onCreate: listener({say, setStatus, setSuggestedPrompts, setTitle})
   }).start();
 
    if( "text" in message && !! message.text && "user" in message){
      console.log("sending message");
      assistant.send({
        timestamp: message.ts,
        role: "user",
        user: message.user,
     
        type:`@message.${message.subtype || "user"}`,
        content: message.text
      } ); 

      console.log("message sent",assistant.getPersistedSnapshot());

    } 
  }
});

 
 
const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  socketMode: true,
  // receiver: socketModeReceiver,
  appToken: env.SLACK_APP_TOKEN,
  logLevel: LogLevel.DEBUG,
}); 
const port = process.env.PORT || 8080;


(async () => {
  // Start your app
  await app.start(port);

  app.logger.info('⚡️ Bolt app is running!');
})();

app.assistant(assistant);

// Add Slack command to connect to an MCP server in the current session
app.command('/mcp-connect', async ({ command, ack, respond }) => {
  await ack();
  const sessionId = command.thread_ts || command.channel_id;
  const url = command.text.trim();
  if (!url) {
    await respond('Please provide the MCP server URL. Usage: /mcp-connect <url>');
    return;
  }
  try {
    const session = getOrCreateMcpAgent(sessionId);
   await session.connect(url);
    await respond(`Connected to MCP server at ${url}`);
  } catch (err) {
    await respond(`Failed to connect: ${err}`);
  }
});

// Add Slack command to disconnect from an MCP server in the current session
app.command('/mcp-disconnect', async ({ command, ack, respond }) => {
  await ack();
  const sessionId = command.thread_ts || command.channel_id;
  const serverId = command.text.trim();
  if (!serverId) {
    await respond('Please provide the MCP server id to disconnect. Usage: /mcp-disconnect <serverId>');
    return;
  }
  try {
    const session = getOrCreateMcpAgent(sessionId);
    await session.closeConnection(serverId);
    await respond(`Disconnected from MCP server with id: ${serverId}`);
  } catch (err) {
    await respond(`Failed to disconnect: ${err}`);
  }
});






// Helper to build the server blocks for the home view
function buildServerBlocks(session:MCPClientManager,user:string) {
  const servers = Object.entries(session.mcpConnections).map(([name, {url}]) => ({name, url}));
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "MCP Server: " + `${env.MCP_GATEWAY_URL}/${user}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "MCP Dashboard: " + `${env.MCP_DASHBOARD_URL}/agents/${user}` },
    },
    { type: "divider" },
    ...(
      servers.length === 0
        ? [{
            type: "context",
            elements: [{ type: "mrkdwn", text: "No servers connected." }]
          }]
        : [
            {
              type: "section",
              text: { type: "mrkdwn", text: "*Connected Servers:*" }
            },
            ...servers.map(({name, url}) => ({
              type: "section",
              text: { type: "plain_text", text: `${name} (${url})` },
              accessory: {
                type: "button",
                text: { type: "plain_text", text: "Remove", emoji: true },
                style: "danger",
                value: name,
                action_id: "disconnect_mcp_server"
              }
            }))
          ]
    ),
    { type: "divider" },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Add Server*' },
    },
    {
      type: "input",
      block_id: "mcp_server",
      // dispatch_action: true,
      element: {
        type: "url_text_input",
        action_id: "url",
        initial_value: "https://mcpagent.val.run/mcp",
        placeholder: {
          type: "plain_text",
          text: "Enter the MCP server URL"
        }
      },
      label: {
        type: "plain_text",
        text: "URL"
      }
    },
    {
      type: "input",
      block_id: "mcp_server_name",
      element: {
        type: "plain_text_input",
        action_id: "name",
        initial_value: "mcpagent.val.run",
        placeholder: {
          type: "plain_text",
          text: "Server Name"
        }
      },
      label: {
        type: "plain_text",
        text: "Name"
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Connect :spm-connectors:" },
          action_id: "connect_mcp_server"
        }
      ]
    }
  ];
}
  
// Update connect_mcp_server to use the name
app.action('connect_mcp_server', async ({ ack, client, logger, body, action }) => {
  await ack();
  const url = body.view.state.values.mcp_server.url.value;
  const name = body.view.state.values.mcp_server_name.name.value;
  const session = getOrCreateMcpAgent(body.user.id);
  await session.connect(url, { id: name });
  const user = body.user.id;
  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: {
      type: "home",
      blocks: [
        ...buildServerBlocks(session,user),
      ]
    }
  });
});

app.action('disconnect_mcp_server', async ({ ack, body, logger,action , options, client}) => {
  console.log("disconnect_mcp_server",action,body);
  const session = getOrCreateMcpAgent(body.user.id);
  await session.store.delete(action.value);
  await ack();
  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: {
      type: "home",
      blocks: [
        ...buildServerBlocks(session,body.user.id),
      ]
    }
  });
});

app.options('mcp_servers', async ({ ack, body, logger , options}) => {
  console.log("mcp_servers",options,body.value, body.view.state.values.mcp_server.url.value);
  await ack({
    options: [{
      "text": {
        "type": "plain_text",
        "text": 'https://mcpagent.val.run/mcp'
      },
      "value": 'https://mcpagent.val.run/mcp'
    }]
  });
});


// In app_home_opened, use the helper to build blocks
app.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    
    const session = getOrCreateMcpAgent(event.user);

    // Call views.publish with the built-in client
    const result = await client.views.publish({
      user_id: event.user,
      view: {
        type: "home",
        blocks: [ 
          ...buildServerBlocks(session,event.user),
          
        ]
      }
    });

 
    logger.info(result);
  } catch (error) {
    logger.error(error);
  }
});


  

export default {
  fetch:async function handlePostRequest(req: Request): Promise<Response> {
 
    return new Response( "ok");
  },
};


function checkEvent<TType extends string>(event:  EventObject,type: TType ): event is EventObject & {type: TType} {
  return event.type === type;
}

const clients= new Map<string,McpClient>();
 async function getOrCreateMcpClient(id: string) {
  // return getOrCreateMcpAgent(id);
  if(clients.has(id)){
    return clients.get(id)!;
  }
  const client =new McpClient({
   name: `mcp-client-${id}`,
   version: "1.0.0",
   url: new URL(`${env.MCP_GATEWAY_URL}/${id}`),
  });

  await client.connect(new StreamableHTTPClientTransport(new URL(`${env.MCP_GATEWAY_URL}/${id}`)));
  
  return client;

}