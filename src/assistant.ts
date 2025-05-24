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
import{ fromMcpMessageHandler } from "./assistant.message.ts";
import { Bootstrap, fromMcpBootstrap } from "./assistant.bootstrap.ts";
import { Chat } from "./assistant.chat.ts";
import { type MCPClientManager } from "./gateway.mcp.connection.ts";
import { Tool, ToolCall, ToolResult ,experimental_createMCPClient} from "ai";
import { MCPClientConnection } from "./gateway.mcp.client.ts";
import {Client as McpClient} from "@modelcontextprotocol/sdk/client/index.js";
// type McpClient = ReturnType<typeof experimental_createMCPClient>;
export function fromMcpSession(client:McpClient) {
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
      message: fromMcpMessageHandler(client),
      bootstrap: fromMcpBootstrap(client),
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
            target: "listening",
            actions:[({event})=>console.log("bootstrap error",event),{
              type: "reportError",
              params: ({ event: { error } }) => error,
            }]
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


export namespace Tools {
  export type ToolAvailableEvent = {
    type: "@tool.available";
    tools: { [key: string]: Tool };
  };
  export type ToolCallEvent = {
    type: "@tool.call";
  } & ToolCall<string, unknown>;
  export type ToolResultEvent = {
    type: "@tool.result";
  } & ToolResult<string, unknown, unknown>;

  export type Event = ToolAvailableEvent | ToolCallEvent | ToolResultEvent;
}
