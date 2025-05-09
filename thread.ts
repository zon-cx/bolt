import {
  StateMachine,
  createMachine,
  assign,
  spawnChild,
  createActor,
  ActorRefFrom,
  setup,
  sendTo,
  forwardTo,
  fromPromise,
  ProvidedActor,
  PromiseActorLogic,
  ActionFunction,
  ActionFunctionMap,
  ObservableActorLogic,
  fromObservable,
  AnyEventObject,
  Values,
  log,
  enqueueActions,
  ActorLogicFrom,
  fromCallback,
} from "xstate";
import pkg, {
  AssistantUserMessageMiddleware,
  webApi,
  type AssistantThreadStartedMiddleware,
} from "@slack/bolt";
import { fromEventAsyncGenerator } from "./iterator.ts";
type ThreadInput = ThreadStartedArgs["event"]["assistant_thread"];
import { azure } from "@ai-sdk/azure";
import { jsonSchema, streamObject, streamText, TextStreamPart } from "ai";
import { generateText } from "ai";
import { ConversationsRepliesResponse } from "@slack/web-api";
// --- Type Definitions ---

type ThreadStartedArgs = Parameters<AssistantThreadStartedMiddleware>[0];
type ThreadMessageArgs = Parameters<AssistantUserMessageMiddleware>[0];

type ThreadActor<T extends (args?: any) => any | void> = T extends (
  args: infer P
) => PromiseLike<infer R>
  ? PromiseActorLogic<R, P, AnyEventObject>
  : T extends () => PromiseLike<infer R>
  ? PromiseActorLogic<R, any, AnyEventObject>
  : T extends (...args: infer P) => PromiseLike<void>
  ? PromiseActorLogic<any, P, AnyEventObject>
  : never;

interface AssistantPrompt {
  /** @description Title of the prompt. */
  title: string;
  /** @description Message of the prompt. */
  message: string;
}

export const llmResponder = fromPromise(
  async ({
    input: { history, system, prompt },
  }: {
    input: {
      history?: ConversationsRepliesResponse["messages"];
      system?: string;
      prompt?: string;
    };
  }) => {
    const threadHistory = history
      ?.filter((m) => m.text)
      .map((m) => ({
        role: m.bot_id
          ? "assistant"
          : ("user" as "system" | "user" | "assistant" | "data"),
        content: m.text!,
      }));

    // 3. Call LLM
    const { text: aiText } = await generateText({
      model: azure("gpt-4o"),
      system: system || "You are a helpful assistant in Slack.",
      messages: threadHistory,
      prompt: prompt,
      maxSteps: 10,
    });
    return aiText;
  }
);

export const slack = {
  actors: {
    llm: llmResponder,
    say: undefined as unknown as ThreadActor<ThreadStartedArgs["say"]>,
    saveContext: undefined as unknown as ThreadActor<
      ThreadStartedArgs["saveThreadContext"]
    >,
    getContext: undefined as unknown as ThreadActor<
      ThreadStartedArgs["getThreadContext"]
    >,
    setStatus: undefined as unknown as ThreadActor<
      ThreadStartedArgs["setStatus"]
    >,
    setSuggestedPrompts: undefined as unknown as ThreadActor<
      ThreadStartedArgs["setSuggestedPrompts"]
    >,
    setTitle: undefined as unknown as ThreadActor<
      ThreadStartedArgs["setTitle"]
    >,
    fetchThreadHistory: undefined as unknown as PromiseActorLogic<
      ConversationsRepliesResponse["messages"],
      any,
      AnyEventObject
    >,
  },
  actions: {
    say: (_, params: Parameters<ThreadStartedArgs["say"]>[0]) => {
      console.log("saying", params);
    },
    setStatus: (_, params: Parameters<ThreadStartedArgs["setStatus"]>[0]) => {
      console.log("setting status", params);
    },
    setSuggestedPrompts: (
      _,
      params: Parameters<ThreadStartedArgs["setSuggestedPrompts"]>[0]
    ) => {
      console.log("setting prompts", params);
    },
    setTitle: (_, params: Parameters<ThreadStartedArgs["setTitle"]>[0]) => {
      console.log("setting title", params);
    },
    saveContext: (_, params?: any) => {
      console.log("saving context", params);
    },
  },
};

// type AssistantPrompt = Parameters<ThreadStartedArgs["setSuggestedPrompts"]>[0]["prompts"][0]

const boostrapSetup = setup({
  types: {} as {
    context: ThreadInput & { prompts: AssistantPrompt[]; error?: any };
    events: { type: "prompt"; title: string; message: string };
    input: ThreadInput;
  },
  actors: {
    suggestPrompts: fromEventAsyncGenerator(async function* ({
      input,
    }: {
      input: ThreadInput;
    }) {
      const { elementStream } = streamObject<AssistantPrompt>({
        model: azure("gpt-4o"),
        output: "array",
        mode: "json",

        prompt:
          "You are a helpful assistant. you need to suggest 3 prompts for the user to choose from.",
        schema: jsonSchema({
          type: "object",
          properties: {
            title: { type: "string" },
            message: { type: "string" },
          },
        }),
      });
      for await (const part of elementStream) {
        console.log(part);
        yield { type: "prompt", ...part };
      }
      return "done";
    }),
    ...slack.actors,
  },
  actions: slack.actions,
});

export const threadBootstrap = boostrapSetup.createMachine({
  context: ({ input }) => ({
    prompts: [],
    messages: [],
    ...input,
  }),
  initial: "sayingHello",
  states: {
    sayingHello: {
      invoke: {
        src: "llm",
        input: {
          prompt: "You are a helpful assistant. Say hello to the user.",
        },
        onDone: {
          target: "promptSuggestions",
          actions: {
            type: "say",
            params: ({ event }) => event.output,
          },
        },
        onError: {
          target: "#error",
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    promptSuggestions: {
      entry: log("suggesting prompts..."),
      invoke: {
        src: "suggestPrompts",
        input: ({ context }) => context,
        onDone: {
          target: "done",
          actions: [
            {
              type: "setSuggestedPrompts",
              params: ({ context: { prompts } }) => ({
                prompts: prompts as [AssistantPrompt, ...AssistantPrompt[]],
              }),
            },
            "saveContext",
          ],
        },
        onError: {
          target: "#error",
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
      on: {
        prompt: {
          actions: assign({
            prompts: ({ event: { type, ...prompt }, context: { prompts } }) => [
              ...prompts,
              prompt,
            ],
          }),
        },
      },
    },
    error: {
      type: "final",
      id: "error",
      output: ({ context }) => context,
      entry: {
        type: "say",
        params: "Sorry, something went wrong!",
      },
    },
    done: {
      type: "final",
      output: ({ context }) => context,
    },
  },
});

type MessageResponse = string;
type MessageError = any;
const messageSetup = setup({
  types: {} as {
    context: {
      history?: MessageHistory[];
      message: pkg.KnownEventFromType<"message"> & { subtype: "me_message" };
      response?: MessageResponse;
      error?: MessageError;
    };
    input: {
      message: pkg.KnownEventFromType<"message"> & { subtype: "me_message" };
      history?: MessageHistory[];
    };
  },
  actors: slack.actors,
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
          history: context.history || [],
        }),
        onDone: {
          target: "sendingResponse",
          actions: assign({
            response: ({ event }) => event.output,
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
    sendingResponse: {
      entry: {
        type: "setStatus",
        params: "is typing...",
      },
      invoke: {
        src: "say",
        input: ({ context }) => context.response!,
        onDone: [
          {
            target: "setTitle",
            actions: assign({
              history: ({ event, context }) => [
                ...(context.history || []),
                event.output.message!,
              ],
            }),
            guard: ({ event }) => event.output.ok,
          },
          {
            target: "error",
            actions: assign({
              error: ({ event }) => event.output.error,
            }),
            guard: ({ event }) => !event.output.ok,
          },
        ],
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
        params: "Sorry, something went wrong!",
      },
    },
  },
});


type AssistantThreadStartedMiddlewareArgs =
  Parameters<pkg.AssistantThreadStartedMiddleware>[0];
type AssistantUserMessageMiddlewareArgs =
  Parameters<pkg.AssistantUserMessageMiddleware>[0];

const actions = ({
  say,
  setStatus,
  setTitle,
  setSuggestedPrompts,
  saveThreadContext,
}: AssistantThreadStartedMiddlewareArgs | AssistantUserMessageMiddlewareArgs) =>
  ({
    say: (_, params) => say(params),
    setStatus: (_, params) => setStatus(params),
    setSuggestedPrompts: (_, params) => {
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
  } satisfies Partial<(typeof slack)["actions"]>);

const actors = ({
  say,
  saveThreadContext,
  setStatus,
  setTitle,
  setSuggestedPrompts,
  getThreadContext,
}: AssistantThreadStartedMiddlewareArgs | AssistantUserMessageMiddlewareArgs) =>
  ({
    say: fromPromise(async ({ input }) => await say(input)),
    saveContext: fromPromise(saveThreadContext),
    getContext: fromPromise(getThreadContext),
    setStatus: fromPromise(
      async ({ input }: { input: string }) => await setStatus(input)
    ),
    setSuggestedPrompts: fromPromise(
      async ({ input }) => await setSuggestedPrompts(input)
    ),
    setTitle: fromPromise(
      async ({ input }: { input: string }) => await setTitle(input)
    ),
  } satisfies Partial<(typeof slack)["actors"]>);


  type MessageEvent<T extends pkg.types.MessageEvent["subtype"]= pkg.types.MessageEvent["subtype"]> = ThreadMessageArgs & {
    type: `@message.${T}`;
    message: pkg.types.MessageEvent & { subtype: T };
  };

  type MessageHistory = Omit<pkg.types.MessageEvent, "subtype" | "channel_type" | "channel" |"event_ts" |"type" | "ts"> & {ts?:string}
  const threadSetup = setup({
    types: {} as {
      context: {
        history?: MessageHistory[];
        summary?: string;
        error?: unknown;
      };
      events: MessageEvent | {type:"end"}
    },
    actors: {
      ...slack.actors,
      message: messageMachine
    },
    actions: slack.actions,
  });
  
const threadMachine = threadSetup.createMachine({
  id: "thread",
  initial: "fetchingHistory", 
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
    listening: {
      entry: {
        type: "setStatus",
        params: "listening...",
      },
      on: {
        "@message.me_message": {
          actions:  enqueueActions(({ event, enqueue, context: { history } }) => {
            const { message } = event; 
            enqueue.spawnChild(
              messageMachine.provide({
                actions: actions(event),
                actors: actors(event),
              }), {
                syncSnapshot: true,
                systemId: message.ts,
                input: {
                  message: message,
                  history: history
                },
              }
            );
            enqueue.assign({
              history: ({ event, context: { history } }) => [...(history || []), event.message],
            })

          })
        },
        "@message.*": {
          actions: assign({
            history: ({ event:{message}, context: { history } }) => [...(history || []), message],
          }),
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
  },
});

/*
 actions: enqueueActions(({ event, enqueue, context: { history } }) => {
            const { message } = event;
            // enqueue.assign({
            //   message:  messageMachine.provide({
            //     actions: actions(event),
            //     actors: actors(event),
            //   }) 
            // })
            enqueue.spawnChild(
              messageMachine.provide({
                actions: actions(event),
                actors: actors(event),
              }), {
                syncSnapshot: true,
                systemId: message.ts,
                input: {
                  message: message,
                  history: history
                },
              }
            );
          })

 */