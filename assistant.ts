import pkg from "@slack/bolt";
import {
  ActorRefFromLogic,
  createActor,
} from "xstate";
import {
  threadBootstrap,
  actors,
  actions,
} from "./message.ts";
import threadMachine from "./thread.ts";

const { Assistant } = pkg;

const threads = new Map<string, ActorRefFromLogic<typeof threadMachine>>();
const db=new Map<string,pkg.KnownEventFromType<"message">[]>();

const cmap=new Map<string,pkg.types.AssistantThreadContextChangedEvent["assistant_thread"] >()




const assistant = new Assistant({
  /**
   * (Recommended) A custom ThreadContextStore can be provided, inclusive of methods to
   * get and save thread context. When provided, these methods will override the `getThreadContext`
   * and `saveThreadContext` utilities that are made available in other Assistant event listeners.
   */
  threadContextStore: {
    get: async ({ context, client, payload }) => {
      return cmap.get(`${context.botId}_${context.botUserId}_${"channel" in payload ? payload.channel : payload.assistant_thread.channel_id}`)
    },
    save: async ({ context, client, payload }) => {
      if(payload.type==="assistant_thread_started" || payload.type==="assistant_thread_context_changed"){
        cmap.set(`${context.botId}_${context.botUserId}_${payload.assistant_thread.channel_id}`,payload.assistant_thread);
      }
      else if(payload.type==="message"){
        db.set(`${context.botId}_${context.botUserId}`,[
          ...(db.get(`${context.botId}_${context.botUserId}_${payload.channel}`) || []),
          payload]
        );
      }
    },
  },

  /**
   * `assistant_thread_started` is sent when a user opens the Assistant container.
   * This can happen via DM with the app or as a side-container within a channel.
   * https://api.slack.com/events/assistant_thread_started
   */
  threadStarted: async (args) => {
    const { event, logger, context } = args;
   const thread = threads.set(
      event.assistant_thread.thread_ts,
      createActor(
        threadMachine.provide({
          actors: {
            ...actors(args), 
            bootstrap: threadBootstrap.provide({
              actors: actors(args),
              actions: actions(args),
            }),
          },
          actions: actions(args),
        }),
        {
          id: event.assistant_thread.thread_ts,
          input: {
            bot: context,
            thread: event.assistant_thread,
          },

          logger: (...args) => {
            logger.info(...args);
          },
        }
      )
    ).get(event.assistant_thread.thread_ts)!
    thread.start();
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
    const {  message } = args;
    if (isMessageInThread(message) && threads.has(message.thread_ts)) {  
        const thread = threads.get(message.thread_ts)
        thread?.send({
          ...args,
          type:`@message.${message.subtype}`,
        }); 
    }
    else{
      args.say("I'm sorry, I can only help in a thread! ");
    }
  }
});

export default assistant;

type ThreadMessage = pkg.KnownEventFromType<"message"> & {
  thread_ts: string;
};

function isMessageInThread<TMessage extends pkg.KnownEventFromType<"message"> & {thread_ts?:string} | {thread_ts:string}>(
  message: TMessage
): message is ThreadMessage & TMessage    {
  return "thread_ts" in message;
}

