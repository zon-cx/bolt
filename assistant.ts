import pkg, { AllMiddlewareArgs } from "@slack/bolt";
import { ActionFunctionMap, createActor, fromPromise, toPromise, waitFor } from "xstate";
import { slack, threadBootstrap, messageMachine, actors,actions } from "./thread.ts";

const { Assistant } = pkg;

const threads= new Map<string,ActorRef<any,any>>()
type AssistantThreadStartedMiddlewareArgs =
  Parameters<pkg.AssistantThreadStartedMiddleware>[0];
type AssistantUserMessageMiddlewareArgs =
  Parameters<pkg.AssistantUserMessageMiddleware>[0];


const assistant = new Assistant({
  /**
   * (Recommended) A custom ThreadContextStore can be provided, inclusive of methods to
   * get and save thread context. When provided, these methods will override the `getThreadContext`
   * and `saveThreadContext` utilities that are made available in other Assistant event listeners.
   */
  // threadContextStore: {
  //   get: async ({ context, client, payload }) => {},
  //   save: async ({ context, client, payload }) => {},
  // },

  /**
   * `assistant_thread_started` is sent when a user opens the Assistant container.
   * This can happen via DM with the app or as a side-container within a channel.
   * https://api.slack.com/events/assistant_thread_started
   */
  threadStarted: async (args) => {
    const { event, logger } = args;
    const boostrap = createActor(
      threadBootstrap.provide({
        actors: actors(args),
        actions: actions(args),
      }),
      {
        input: event.assistant_thread,
        id: event.assistant_thread.thread_ts,
        logger: (...args) => {
          logger.info(...args);
        }
      }
    );
    boostrap.start();
    await toPromise(boostrap);
    
    /*threads.set(event.assistant_thread.thread_ts,createActor(
      messageMachine.provide({
        actors: {
          say: fromPromise(async ({ input }) => await say(input)),
          fetchThreadHistory: fromPromise(async function () {
            const res = await args.client.conversations.replies({
              channel: event.assistant_thread.channel_id,
              ts: event.assistant_thread.thread_ts,
              oldest: event.assistant_thread.thread_ts,
            });
            return res.messages;
          }),
        },
        actions: {
          say: (_, params) => args.say(params),
          setTitle: (_, params) => args.setTitle(params),
          setStatus: (_, params) => args.setStatus(params),
        },
      }),
      {
        id: event.assistant_thread.thread_ts,
        input: {
          message: {
            subtype: "me_message",
            text: "Hello, help me with my problem , i need to know about the weather in tel aviv",
            user: event.assistant_thread.user_id,
            channel: event.assistant_thread.channel_id,
            ts: event.assistant_thread.thread_ts,
            type: "message",
            event_ts: event.assistant_thread.thread_ts,
            channel_type: "im"  
        } 
      },
        logger: (...args) => {
          logger.info(...args);
        },
      }
    ))*/
  },

  /**
   * `assistant_thread_context_changed` is sent when a user switches channels
   * while the Assistant container is open. If `threadContextChanged` is not
   * provided, context will be saved using the AssistantContextStore's `save`
   * method (either the DefaultAssistantContextStore or custom, if provided).
   * https://api.slack.com/events/assistant_thread_context_changed
   */
  threadContextChanged: async ({ logger, saveThreadContext }) => {
    // const { channel_id, thread_ts, context: assistantContext } = event.assistant_thread;
    try {
      await saveThreadContext();
    } catch (e) {
      logger.error(e);
    }
  },

  /**
   * Messages sent to the Assistant do not contain a subtype and must
   * be deduced based on their shape and metadata (if provided).
   * https://api.slack.com/events/message
   */
  userMessage: async (args) => {
    const {  logger ,message} = args;

    if(message.subtype  =="bot_message" &&  message.bot_id == args.context.botId ) {
      console.log("bot message",message);
      return;
    }

     const messageActor = createActor(
      messageMachine.provide({
        actors: actors(args),
        actions: actions(args),
      }),
      {
        id: message.ts,
        input:  {
          history: await args.client.conversations.replies({
            channel: message.channel,
            ts: message.ts,
            oldest: message.ts,
          }).then((res)=>res.messages),
          message:  message as pkg.KnownEventFromType<"message"> & { subtype: "me_message" }
        },
       logger: (...args) => {
          logger.info(...args);
        },
      }
    );
    messageActor.start();
    await toPromise(messageActor);
  },
});

export default assistant;
