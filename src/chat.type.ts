import {
  CoreAssistantMessage,
  CoreSystemMessage,
  CoreToolMessage,
  CoreUserMessage, Tool, ToolCall, ToolResult,
} from "ai";
import { ActorLogic } from "xstate";
  
export namespace Chat {
  export namespace Say {

  export type Prompt = {
    title: string;
    message: string;
  };

  export type Prompts = {
    type: "@chat.prompts";
    title?: string;
    prompts: [Prompt, ...Prompt[]];
  };

  type Block = {
    type: string;
    blocks?: Block[];
  };

  export type Message = {
    type: "@chat.message";
    message: string;
  };
  export type Blocks = {
    type: "@chat.blocks";
    blocks: Block[]; 
  };


 
  export type Title = { type: "@chat.title"; title: string };

  export type Status = { type: "@chat.status"; status: string };
  
  export type Event = | Prompts | Message | Blocks | Title | Status 
  }
  export namespace Messages {
    export type ToolMessageEvent = {
      type: "@message.tool";
    } & CoreToolMessage &
      Details;

    export type AssistantMessageEvent = {
      type: "@message.assistant";
    } & CoreAssistantMessage &
        Details;

    export type SystemMessageEvent = {
      type: "@message.system";
    } & CoreSystemMessage &
      Details;

    export type UserMessageEvent = {
      type: "@message.user";
    } & CoreUserMessage &
      Details;

    export type InterruptMessageEvent = {
      type: "@message.interrupt";
      role: "system";
    } & CoreUserMessage & Details;

    export type Event =
      | ToolMessageEvent
      | AssistantMessageEvent
      | SystemMessageEvent
      | UserMessageEvent
      | InterruptMessageEvent

    export type Details = {
      type: "@message.user" | "@message.assistant" | "@message.system" | "@message.tool" | "@message.interrupt";
      timestamp?: string;
      user: string;
      role: "user" | "assistant" | "system" | "tool";
      content: unknown;
    }
    export type Input = {
      messages: [Messages.Event, ...Messages.Event[]];
      context: Omit<Session.Context, "messages">;
    };

   

    export type Handler = ActorLogic<any, Chat.Messages.Event, Input, any, Chat.Say.Event>;
  }

}


export namespace Session {
  export type Event =   
      | Chat.Messages.Event
      | Chat.Say.Event
      | Tools.Event
      | ErrorEvent

  export type ErrorEvent = {
    "type": "@error.message-handler";
    "error":  {
      message: string;
      stack?: string;
      code?: number;
    }
  }
      

  export type Input = {
    bot?: Record<string, unknown>;
    thread?: Record<string, unknown>;
  } & Record<string, unknown>;

  export type Context = {
    messages: Chat.Messages.Event[];
    summary?: string;
    error?: any;
    thread?: Record<string, unknown>;
    bot?: Record<string, unknown>;
    current?: Chat.Messages.Event;
    session?: string;
  };
}

export type Optional<T> = {
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
