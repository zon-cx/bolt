import {
  enqueueActions,
  setup,
  assign,
  ActorLogic, Values,
  emit,
} from "xstate";
import { fromEventAsyncGenerator } from "@cxai/stream";
import message from "./assistant.message";

const bootstrap = fromEventAsyncGenerator(async function* ({
  input,
}: {
  input: Thread.Input;
}) {
  yield {
    type: "prompts",
    title: `This is a message from unimplemented bootstrap, bot id: ${input.bot?.botId}`,
    prompts: [
      { title: "Template 1", message: "Hello " },
      { title: "Template 2", message: "Hello 2" },
    ],
  };
}) as unknown as Thread.Bootstrap;
 
 
export const threadSetup = setup({
  types: {} as {
    context: Thread.Context;
    events: Messages.Event
        | Communication.Event
        | { type: "@thread.end" };
    input?: Optional<Thread.Input>;
    actors: {
      message: Messages.Handler;
      bootstrap: Thread.Bootstrap;
    };
  },
  actors: {
    message: message,
    bootstrap: bootstrap,
  },
  actions: { 
   emit: emit((_, e: Communication.Emitted) => (e)), 
   saveContext: () => {}
   } 
});


const threadMachine = threadSetup.createMachine({
  id: "@assistant/thread",
  initial: "boostrap",
  context: ({ input }) => ({
    messages: [],
    ...input,
  }),
  on: {
    prompts: {
        actions: {
          type: "emit",
          params: ({ event: { type: _type, ...event } }) =>({
            type: "prompts",
            data: event
          }) 
        },
      guard: ({ event: { type: _type, prompts } }) => isNotEmpty(prompts),
    },
    say: {
      actions: [
     
        {
          type: "emit",
          params: ({event: {message}, context: {bot}}) => ({
            type: "@message.assistant",
            content: typeof message === "string" ? message : message.text,
            role: "assistant",
            timestamp: Date.now().toString(),
            user: bot?.botId?.toString() || "assistant"
          })
        }
      ],
    },
    title: {
      actions: enqueueActions(({ event: { title }, enqueue }) => {
        enqueue({
          type: "emit",
          params: ({event: {title}}) => ({
            type: "title",
            data: title
          })
        });
      }),
    },
    status: {
      actions: enqueueActions(({ event: { status }, enqueue }) => {
        enqueue({
          type: "emit",
          params: ({event: {status}}) => ({
            type: "status",
            data: status
          })
        });
      }),
    },
  },
  states: { 
    boostrap: {
      entry: {
        type: "emit",
        params: {
          type: "status",
          data: "is typing..."
        }
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
          type: "status",
          data: ""
        }
      },
      on: { 
        "@message.*": {
          target: "processing",
          actions: [assign({
            messages: ({ event, context: { messages } }) => [
              ...messages,
              event,
            ],
          }), {
            type:"emit",
            params: ({ event }) => event
          }]
        },
        
      }
    },
    processing: {
      entry: {
        type: "emit",
        params: {
          type: "status",
          data: "is typing..."
        }
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
      entry:{
        type:"emit",
          params:()=>  ({
            type: "@message.assistant",
            content: "Goodbye! It was nice talking to you!",
            role: "assistant",
            timestamp: Date.now().toString(),
            user: "assistant"
          })
        } 
    },
    error: {
      type: "final",
      entry: {
        type: "emit",
        params: ({ context: { error } }) => ({
          type: "@message.assistant",
          content: "Sorry, something went wrong! " + "message" in error
            ? error.message
            : "",
          role: "assistant",
          timestamp: Date.now().toString(),
          user: "assistant"
        })
      },
    },
  }
}) 


export default threadMachine;

function isNotEmpty<TItem, TArray extends Array<TItem>>(
  value: TArray
): value is NotEmpty<TArray> {
  return value.length > 0;
}
declare type NotEmpty<T> = T extends [infer U, ...infer V]
  ? T & [U, ...U[]]
  : never;





 
export namespace Communication {

  export type Prompt = {
    title: string;
    message: string;
  };
  
  export type Prompts = {
    type: "prompts";
    title?: string;
    prompts: [Prompt, ...Prompt[]];
  };

  type Block = {
    type: string;
    blocks?: Block[];
  };
  
  export type Say = {
    type: "say";
    message: string | { text: string; blocks?: Block[] };
    
  };

  export type Title = { type: "title"; title: string };

  export type Status = { type: "status"; status: string };

  export type Event = Prompts | Say | Title | Status;

    export type Emitted = | {
      type:"status",
      data: Status["status"]
    } | {
      type:"title",
      data: Title["title"]
    }| {
      type:"prompts",
      data: Omit<Prompts, "type">
    } | Messages.Event
}

export namespace Messages { 
  export type Event = {
    type: `@message.${string}`;
   } & Details;
  export type Details = {
    type: `@message.${string}`;
    content: string;
    role: "user" | "assistant" | "system";
    timestamp: string;
    user: string;
 
  };

  export type Input = {
    messages: [Messages.Event, ...Messages.Event[]];
    context: Omit<Thread.Context, "messages">;
  };
  
  export type Handler =ActorLogic<
      any,
      Communication.Event,
      Input,
      any,
      Communication.Event
  >;
}

export namespace Thread {
  export type Event = {
    type: `@thread.${string}`;
  }
  
  export type Input = {
    bot?: Record<string, unknown>;
    thread?: Record<string, unknown>;
  } & Record<string, unknown>;

 
  export type Bootstrap = ActorLogic<
      any,
      Communication.Event,
      Input,
      any,
      Communication.Event
  >;

  export type Context = {
    messages: Messages.Details[];
    summary?: string;
    error?: any;
    thread?: Record<string, unknown>;
    bot?: Record<string, unknown>;
    current?: Messages.Details;
  };


}


 
type Optional<T> = {
  [K in keyof T]?: T[K];
};
 