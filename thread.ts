import { enqueueActions,setup,assign } from "xstate";
import { messageMachine, actions, actors, MessageHistory, MessageEvent, slack, threadBootstrap } from "./message.ts";
import pkg from "@slack/bolt";
export const threadSetup = setup({
  types: {} as {
    context: {
      history?: MessageHistory[];
      summary?: string;
      error?: unknown;
      thread:pkg.types.AssistantThreadStartedEvent["assistant_thread"],
      bot: pkg.Context
    }  
    events: MessageEvent | { type: "end"; };
    input: {
      thread:pkg.types.AssistantThreadStartedEvent["assistant_thread"],
      bot:pkg.Context
    }
  },
  actors: {
    ...slack.actors,
    message: messageMachine,
    bootstrap: threadBootstrap
  },
  actions: slack.actions,
});

const threadMachine = threadSetup.createMachine({
  id: "thread",
  initial: "boostrap",
  context: ({input})=>input,
  states: {
    fetchingHistory: {
      entry: {
        type: "setStatus",
        params: "fetching history...",
      },
      invoke: {
        src: "fetchThreadHistory",
        onDone: {
          target: "listening",
          actions: assign({
            history: ({ event }) => event.output
          }),
        },
      },
    },
    boostrap: {
      entry: {
        type: "setStatus",
        params: "boostraping...",
      },
      invoke: {
        src: "bootstrap",
        input: ({context})=>context.thread,
        onDone: {
          target: "listening",
        },
      },
    },
    listening: {
      entry: {
        type: "setStatus",
        params: "listening...",
      },
      on: {
        "@message.bot_message": {
          actions: assign({
            history: ({ event: { message }, context: { history } }) => [...(history || []), message],
          })
        },
        "@message.*": {
          actions: enqueueActions(({ event, enqueue, context: { history, bot, thread } }) => {
            const { message } = event;
            console.log("message!!!",message,history);
            
            enqueue.spawnChild(
              messageMachine.provide({
                actions: actions(event),
                actors: actors(event),
              }), {
              syncSnapshot: true,
              systemId: message.ts,
              input: {
                bot: bot,
                thread: thread,
                message: message,
                history: history
              },
            }
            );
            enqueue.assign({
              history: ({ event, context: { history } }) => [...(history || []), event.message],
            });

          }),
          guard: ({ event,context }) => event.message.subtype !== "bot_message" || event.message.bot_id !== context.bot.botId
        },
        
        },

        end: {
          target: "done",
        },
      }
    },

    done: {
      type: "final",
    },
    error: {
      type: "final",
    },
  });

export default threadMachine;