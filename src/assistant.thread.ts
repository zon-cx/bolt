import { enqueueActions,setup,assign , fromPromise} from "xstate";
import { messageMachine } from "./assistant.message.ts";
import pkg from "@slack/bolt";
import { MessageHistory, slack ,actions,actors,MessageEvent} from "./slack.assistant.ts";

type ThreadContext = {
  history?: MessageHistory[];
  summary?: string;
  error?: any;
  thread:pkg.types.AssistantThreadStartedEvent["assistant_thread"],
  bot: pkg.Context
}
export const threadSetup = setup({
  types: {} as {
    context: ThreadContext;
    events: MessageEvent | { type: "end"; };
    input: {
      thread:pkg.types.AssistantThreadStartedEvent["assistant_thread"],
      bot:pkg.Context
    }
  },
  actors: {
    ...slack.actors,
    message: messageMachine,
    bootstrap: fromPromise(async function({input}:{input:ThreadContext}){
        console.log("bootstraping default implementation" , input);
    })
  },
  actions: slack.actions,
});

const threadMachine = threadSetup.createMachine({
  id: "thread",
  initial: "boostrap",
  context: ({input})=>input,
  states: {
    boostrap: {
      entry: {
        type: "setStatus",
        params: "boostraping...",
      },
      invoke: {
        src: "bootstrap",
        input: ({context})=>context,
        onDone: {
          target: "listening",
          actions: {
            type:"saveContext"
          }
        },
        onError: {
          target: "error",
        },
      }
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
        end: {
          target: "done",
        },
      }
    },

    done: {
      type: "final",
      entry: {
        type: "say",
        params: "Goodbye! It was nice talking to you!"
      },
    },
    error: {
      type: "final",
      entry: {
        type: "say",
        params:({context:{error}})=> "Sorry, something went wrong! " +  "message" in error ? error.message : ""
      }
    }
  }
});

export default threadMachine;