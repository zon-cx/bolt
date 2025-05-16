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
    export type Actions = {
      type:"say",
      params: Say["message"]
    } | {
      type:"setStatus",
      params: Status["status"]
    } | {
      type:"setTitle",
      params: Title["title"]
    }

    export type Emited = {
      type:"assistant",
      data: Say["message"]
    } | {
      type:"status",
      data: Status["status"]
    } | {
      type:"title",
      data: Title["title"]
    }| {
      type:"prompts",
      data: Prompts["prompts"]
    }
}

export namespace Messages { 
  export type Event = {
    type: `@message.${string}`;
   } & Details;
  export type Details = {
    type: `@message.${string}`;
    content: string;
    role: "user" | "assistant";
    timestamp: string;
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
 





export const threadSetup = setup({
  types: {} as {
    context: Thread.Context;
    events: Messages.Event
        | Communication.Event
        | { type: "@thread.end" };
    input?: Optional<Thread.Input>;
    actions: Communication.Actions
    actors: {
      message: Messages.Handler;
      bootstrap: Thread.Bootstrap;
    };
    // emitted:  Communication.Emited
  },
  actors: {
    message: message,
    bootstrap: bootstrap,
  },
  actions: {
    say: emit((_: any, params: Communication.Say["message"]) => ({
      type: "assistant",
      data: params
    })
  ) ,
  setStatus: emit((_, s: string) => ({
    type: "status",
    data: s
  })),
  setTitle: emit((_: any, t: string) => ({
    type: "title",
    data: t
  })),
  setSuggestedPrompts: emit((_: any, p: any) => ({
    type: "prompts",
    data: p.prompts
  })),
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
        type: "setSuggestedPrompts",
        params: ({ event: { type: _type, ...event } }) =>
          event as Omit<Communication.Prompts, "type">,
      },
      guard: ({ event: { type: _type, prompts } }) => isNotEmpty(prompts),
    },
    say: {
      actions: enqueueActions(({ event: { message }, enqueue }) => {
        enqueue({
          type: "say",
          params: message,
        });
      }),
    },
    title: {
      actions: enqueueActions(({ event: { title }, enqueue }) => {
        enqueue({
          type: "setTitle",
          params: title,
        });
      }),
    },
    status: {
      actions: enqueueActions(({ event: { status }, enqueue }) => {
        enqueue({
          type: "setStatus",
          params: status,
        });
      }),
    },
  },
  states: {
    idle: {
      on: {
        "@thread.start": "boostrap",
      },
    },
    boostrap: {
      entry: {
        type: "setStatus",
        params: "is typing...",
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
          onError: {
            target: "error",
          },
        },
      },
    },
    listening: {
      on: {
        "@message.bot_message": {
          actions: assign({
            messages: ({ event: message, context: { messages: history } }) => [
              ...(history || []),
              message,
            ],
          }),
        },
        "@message.*": {
          target: "processing",
          actions: assign({
            messages: ({ event, context: { messages } }) => [
              ...messages,
              event,
            ],
          }),
        },
      },
    },
    processing: {
      entry: {
        type: "setStatus",
        params: "is typing...",
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
        type: "say",
        params: "Goodbye! It was nice talking to you!",
      },
    },
    error: {
      type: "final",
      entry: {
        type: "say",
        params: ({ context: { error } }) =>
          "Sorry, something went wrong! " + "message" in error
            ? error.message
            : "",
      },
    },
  },
});



export default threadMachine;

function isNotEmpty<TItem, TArray extends Array<TItem>>(
  value: TArray
): value is NotEmpty<TArray> {
  return value.length > 0;
}
declare type NotEmpty<T> = T extends [infer U, ...infer V]
  ? T & [U, ...U[]]
  : never;

// store.subscribe(...)
// store.sync(...)
// store.restore()
