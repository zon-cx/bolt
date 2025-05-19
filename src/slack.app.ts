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
} from "xstate";
const { Assistant } = slack;

import sessionMachine from "./assistant";
import yjsActor from "./assistant.store";
import { AllAssistantMiddlewareArgs } from "@slack/bolt/dist/Assistant";
import messages from "./slack.messages";
 const log=(logger:slack.Logger) => (...args:any[])=>{
   logger.info(...args);
 }
 
 function listener(args:Pick<AllAssistantMiddlewareArgs,"say" | "setStatus" | "setSuggestedPrompts" | "setTitle"   >){
  return function listene(actor:ReturnType<typeof createActor>){
  const {say, setStatus, setSuggestedPrompts, setTitle} = args;
  actor.on("@message.assistant", (event) => {
    const {content} = event;
    say(content);
  }); 
  actor.on("status", (event) => {
    setStatus(event.data);
  });
  actor.on("title", (event) => {
    setTitle(event.data);
  });
  actor.on("prompts", (event) => {
    setSuggestedPrompts(event.data);
  }); 
  actor.on("@tool.call", (event) => {
    console.log("tool call", event);
    say(messages.listToolsMessage("tool call", event));
  });
  actor.on("@tool.result", (event) => {
    console.log("tool result", event);
    say(messages.listToolsMessage("tool result", event));
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
  threadStarted: async ({say, setStatus, setSuggestedPrompts, setTitle, saveThreadContext,event, context, logger}) => {
    const id= event.assistant_thread.thread_ts;
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

    const assistant = await yjsActor(sessionMachine,{
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
  userMessage: async ( {message, say, setStatus, setSuggestedPrompts, setTitle, logger, context}) => {
    const id = ("thread_ts" in message && message.thread_ts) || message.event_ts || message.ts;
    console.log("userMessage",message); 

    const assistant =await yjsActor(sessionMachine,{
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


/*
userMessage: async ( {message, say, setStatus, setSuggestedPrompts, setTitle, logger, context}) => {
    const id = ("thread_ts" in message && message.thread_ts) || message.event_ts || message.ts;
    console.log("userMessage",message);
    
     
      
 
    const mcpActor= createActor(mcpSession.provide({
      actors: {
        "messages/callback": mcpSession,
        "communication/callback": fromCallback(({ receive }) => {
              receive((event) => {
                console.debug("command/callback",event); 

                if(checkEvent(event, "@communication.say")){
                  say(event.message);
                }
                if(checkEvent(event, "@communication.status")){
                  setStatus(event.status);
                }
                if(checkEvent(event, "@communication.title")){
                  setTitle( event.title);
                }
                if(checkEvent(event, "@communication.prompts")){
                  setSuggestedPrompts(event);
                }
                if(checkEvent(event, "@communication.toolListChanged")){
                  say(messages.listToolsMessage("available tools", new Map(Object.entries(event.tools))));
                }
                
              });
            }),
      }

    }),{
      input: context,
      id: `@assistant/${id}`,
      logger: log(logger),
      systemId:`@assistant/mcp/${id}`
  });
  
     mcpActor.start();

     console.log("mcpActor created",mcpActor.getPersistedSnapshot().status);
  //   const assistant =await yjsActor(sessionMachine.provide({
  //     actors: {
  //       bootstrap: prompter
  //     },    
  //   }),{
  //     doc: `@assistant/${id}`,
  //     logger: log(logger),
  //     onCreate: listener({say, setStatus, setSuggestedPrompts, setTitle})
  //  }).start();
 
    await waitFor(mcpActor, (state) => state.matches("connected")).catch(logger.error);
   console.log("connected mcpActor/",mcpActor.getPersistedSnapshot());
    if( "text" in message && !! message.text && "user" in message){
      console.log("sending message");
      mcpActor.send({
        timestamp: message.ts,
        role: "user",
        user: message.user,
     
        type:`@message.${message.subtype || "user"}`,
        content: message.text
      } ); 

      console.log("message sent",mcpActor.getPersistedSnapshot());

    } 
  }
});
*/
 
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

export default {
  fetch:async function handlePostRequest(req: Request): Promise<Response> {
 
    return new Response( "ok");
  },
};


function checkEvent<TType extends string>(event:  EventObject,type: TType ): event is EventObject & {type: TType} {
  return event.type === type;
}

