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
import{ fromMcpMessageHandler } from "./chat.handler.message.ts";
import { Bootstrap, fromMcpBootstrap } from "./chat.handler.bootstrap.ts";
import {Chat, Session, Tools} from "./chat.type";
import { MCPClient } from "./mcp.client.ts";

// type McpClient = ReturnType<typeof experimental_createMCPClient>;
export function fromMcpSession(client:MCPClient) {
  const sessionSetup = setup({
    types: {} as {
      context: Session.Context;
      events: Session.Event;
      input?: Session.Input;
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
      reportError:  emit((_e, error:Session.ErrorEvent["error"])=>({
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
              params: ({ event: { error } }) => ({
                stack: error instanceof Object && "stack" in error ? error.stack as string : undefined,
                message: error instanceof Object && "message" in error ? error.message as string  : String(error),
                code:  error instanceof Object && "code" in error ? error.code as number : undefined,
              }),
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
              error: ({ event: { error } }) => ({
                stack: error instanceof Object && "stack" in error ? error.stack as string : undefined,
                message: error instanceof Object && "message" in error ? error.message as string  : String(error),
                code:  error instanceof Object && "code" in error ? error.code as number : undefined,
              }),
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
          params: ({ context:{error} }) => error,
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

