import { 
  assign, 
  setup, 
} from "xstate";
import pkg from "@slack/bolt";
 import { MessageHistory, slack } from "./slack.assistant.ts";
import { llmResponder } from "./ai.ts";
// --- Type Definitions ---


 
 
const messageSetup = setup({
  types: {} as {
    context: {
      history?: MessageHistory[];
      message: pkg.KnownEventFromType<"message"> & { subtype: "me_message" };
      response?: string;
      error?: any;
    };
    input: {
      message: pkg.KnownEventFromType<"message"> & { subtype: "me_message" };
      history?: MessageHistory[];
    };
  },
  actors: {
    ...slack.actors,
    llm:llmResponder
  },
  actions: slack.actions,
});

export const messageMachine = messageSetup.createMachine({
  id: "message",
  initial: "responding",

  context: ({ input }) => input,
  states: {
    loading: {
      entry: {
        type: "setStatus",
        params: "loading...",
      },
      invoke: {
        src: "fetchThreadHistory",
        onDone: {
          target: "responding",
          actions: assign({
            history: ({ context, event }) => [
              ...(event.output || []),
              context.message,
            ],
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    responding: {
      entry: {
        type: "setStatus",
        params: "is thinking...",
      },
      invoke: {
        src: "llm",
        input: ({ context }) => ({
          history: [...(context.history || []), context.message],

        }),
        onDone: {
          target: "done",
          actions:  {
            type: "say",
            params: ({ event }) => event.output,
          }
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    setTitle: {
      entry: {
        type: "setStatus",
        params: "finalizing...",
      },
      invoke: {
        src: "llm",
        input: ({ context }) => ({
          history: context.history,
          system: "suggest a title for the conversation.",
        }),
        onDone: {
          target: "done",
          actions: {
            type: "setTitle",
            params: ({ event }) => event.output,
          },
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    done: {
      type: "final",
      output: ({ context }) => context,
    },
    error: {
      type: "final",
      entry: {
        type: "say",
        params:({context})=> "Sorry, something went wrong! " + (context.error?.message || "" ) + "\nStack:\n" + (context.error?.stack || ""),
      },
    }
  },
});

