import {
  enqueueActions,
  setup,
  assign,
  ActorLogic,
  Values,
  emit,
  spawnChild,
  fromPromise,
} from "xstate";
import message, { fromMcpMessageHandler } from "./assistant.mcp.message.ts";
import bootstrap, { Bootstrap, fromMcpBootstrap } from "./assistant.mcp.bootstrap.ts";
import mcpClient, { Tools } from "./assistant.mcp.client.ts";
import { Chat } from "./assistant.chat.ts";
import { type MCPClientManager } from "./mcp.agent.ts";

export function fromMcpSession(session: MCPClientManager) {
  const sessionSetup = setup({
    types: {} as {
      context: Session.Context;
      events: Session.Event;
      input?: Optional<Session.Input>;
      actors: {
        message: Chat.Messages.Handler;
        bootstrap: Bootstrap;
      };
    },
    actors: {
      message: fromMcpMessageHandler(session),
      bootstrap: fromMcpBootstrap(session),
    },
    actions: {
      emit: emit(
        (_, e: Chat.Messages.Event | Chat.Say.Event | Tools.Event) => e
      ),
      reportError:  emit((_e, error:Error)=>({
          type:"@chat.blocks",
          "blocks": [
            {
              "type": "section",
              "text": {
                "text": "*Sorry!* something went wrong! ",
                "type": "mrkdwn"
              },
              "fields": [
                {
                  "type": "mrkdwn",
                  "text": "*Message*"
                },
               
                {
                  "type": "mrkdwn",
                  "text": `\`\`\`\n${(error as Error).message}\n\`\`\``
                },
                {
                  "type": "mrkdwn",
                  "text": "*Stack Trace*"
                },
                {
                  "type": "mrkdwn",
                  "text":  `\`\`\`\n${(error as Error).stack}\n\`\`\``
                }, 
              ]
            }
          ]
      })),
      saveContext: () => {},
    },
  });

  const sessionMachine = sessionSetup.createMachine({
    id: "@assistant/session",
    initial: "boostrap",
    entry: [
      // spawnChild("mcpClient", {
      //   systemId: "mcpClient",
      //   id: "mcpClient",
      //   input: undefined,
      // }),
    ],
    context: ({ input }) => ({
      messages: [],
      ...input,
    }),
    on: {
      "@chat.*": {
        actions: enqueueActions(({ event, enqueue }) => {
          enqueue({
            type: "emit",
            params: ({ event }) => event,
          });
        }),
      },
      "@tool.*": {
        actions: enqueueActions(({ enqueue }) => {
          enqueue({
            type: "emit",
            params: ({ event }) => event,
          });
        }),
      },
      "@error.*": {
        actions: { 
          type: "reportError",
          params: ({ event: { error } }) => error,
        },
      },
    },
    states: {
      // init: {
      //   entry: {
      //     type: "emit",
      //     params: {
      //       type: "@chat.status",
      //       status: "connecting to tool server...",
      //     },
      //   },
      //   invoke: {
      //     src: "init",
      //     onDone: {
      //       target: "boostrap",
      //     },
      //     onError: {
      //       target: "error",
      //       actions: assign({
      //         error: ({ event: { error } }) => error,
      //       }),
      //     },
      //   },
      // },
      boostrap: {
        entry: {
          type: "emit",
          params: {
            type: "@chat.status",
            status: "is typing...",
          },
        },
        invoke: {
          src: "bootstrap",
          input: ({ context }) => context,
          onDone: {
            target: "listening",
            actions: {
              type: "saveContext",
              params: ({ context }) => context,
            },
          },
          onError: {
            target: "error",
            actions: assign({
              error: ({ event: { error } }) => error,
            }),
          },
        },
      },
      listening: {
        entry: {
          type: "emit",
          params: {
            type: "@chat.status",
            status: "",
          },
        },
        on: {
          "@message.assistant": {
            actions: [
              assign({
                messages: ({ event, context: { messages } }) => [
                  ...messages,
                  event,
                ],
              }),
              {
                type: "emit",
                params: ({ event }) => event,
              },
            ],
          },
          "@message.*": {
            target: "processing",
            actions: [
              assign({
                messages: ({ event, context: { messages } }) => [
                  ...messages,
                  event,
                ],
              }),
              {
                type: "emit",
                params: ({ event }) => event,
              },
            ],
          },
        },
      },
      processing: {
        entry: {
          type: "emit",
          params: {
            type: "@chat.status",
            status: "is typing...",
          },
        },
        invoke: {
          src: "message",
          id: "message-processing",
          input: ({ context: { messages, ...context } }) => ({
            messages: isNotEmpty(messages) ? messages : [context.current!],
            context,
          }),
          onDone: {
            target: "listening",
            actions: {
              type: "saveContext",
              params: ({ context }) => context,
            },
          },
          onError: {
            target: "error",
            actions: assign({
              error: ({ event: { error } }) => error,
            }),
          },
        },
      },

      done: {
        type: "final",
        entry: {
          type: "emit",
          params: () => ({
            type: "@message.assistant",
            content: "Goodbye! It was nice talking to you!",
            role: "assistant",
            timestamp: Date.now().toString(),
            user: "assistant",
          }),
        },
      },
      error: {
        target: "listening",

        entry: {
          type: "reportError",
          params: ({ event: { error } }) => error,
        },
      },
    },
  });
  return sessionMachine;
}

 
export default fromMcpSession;

function isNotEmpty<TItem, TArray extends Array<TItem>>(
  value: TArray
): value is NotEmpty<TArray> {
  return value.length > 0;
}
declare type NotEmpty<T> = T extends [infer U, ...infer V]
  ? T & [U, ...U[]]
  : never;

export namespace Session {
  export type Event =
    | {
        type: `@session.${string}`;
      }
    | {
        type: "@error.*";
        error: Error;
      }
    | Chat.Messages.Event
    | Chat.Say.Event
    | Tools.Event;

  export type Input = {
    bot?: Record<string, unknown>;
    thread?: Record<string, unknown>;
  } & Record<string, unknown>;

  export type Context = {
    messages: Chat.Messages.Details[];
    summary?: string;
    error?: any;
    thread?: Record<string, unknown>;
    bot?: Record<string, unknown>;
    current?: Chat.Messages.Details;
    session?: string;
  };
}

type Optional<T> = {
  [K in keyof T]?: T[K];
};
