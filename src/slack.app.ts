// import { App, LogLevel } from "https://deno.land/x/slack_bolt@1.0.0/mod.ts";
import { env } from "node:process";
import slack from '@slack/bolt'; 
const { App, LogLevel } = slack; 
import {
  ActorRefFromLogic,
  createActor,
  waitFor,
} from "xstate";
const { Assistant } = slack;

import threadMachine from "./assistant";
 import prompter from "./assistant.bootstrap";

 const threads = new Map<string, ActorRefFromLogic<typeof threadMachine>>();
 const log=(logger:slack.Logger) => (...args:any[])=>{
   logger.info(...args);
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

    const thread = threads.set(
      id,
      createActor(
        threadMachine.provide({
          actors: {
            bootstrap: prompter
          },
          actions: {
            say: (_, params ) => say(params),
            setStatus: (_, params ) => setStatus(params),
            setSuggestedPrompts: (_, params ) => {
              console.log("setting prompts", params);
              setSuggestedPrompts(params)
                .then((res) => {
                  console.log("setting prompts res", res);
                })
                .catch((err) => {
                  console.log("setting prompts err", err);
                });
            },
            setTitle: (_, params: string) => setTitle(params),
            saveContext: saveThreadContext,
          }
        }),
        {
          id: id,
          input: input, 
          logger: log(logger)
        }
      )
    ).get(id)!;
    
    thread.start();
     
    waitFor(thread, (state) => state.matches("listening")).then(()=>{
      console.log("thread started",thread.getPersistedSnapshot());
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
  userMessage: async ( {message, say}) => {
    const thread = threads.get("thread_ts" in message && message.thread_ts || message.event_ts || message.ts)

    if( "text" in message && !! message.text){
      thread?.send({
        timestamp: message.ts,
        role: "bot_id" in message ? "assistant" : "user",
        type:`@message.${message.subtype}`,
        content: message.text
      } ); 
    }


    if(!thread){
      say("I'm sorry, I can only help in a thread! "); 
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

export default {
  fetch:async function handlePostRequest(req: Request): Promise<Response> {
 
    return new Response( "ok");
  },
};
