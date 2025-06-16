import {
  CoreAssistantMessage,
  CoreSystemMessage,
  CoreToolMessage,
  CoreUserMessage,
} from "ai";
import { ActorLogic } from "xstate";
import { Session } from "./chat.handler.thread";
 
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

  export type Event = Prompts | Message | Blocks | Title | Status;
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

    export type UserMessgeEvent = {
      type: "@message.user";
    } & CoreUserMessage &
      Details;

    export type InteruptMessageEvent = {
      type: "@message.interupt";
      role: "system";
      content: string;
      timestamp: string;
      user: string;
    } 

    export type Event =
      | ToolMessageEvent
      | AssistantMessageEvent
      | SystemMessageEvent
      | UserMessgeEvent
      | InteruptMessageEvent;

    export type Details = {
      type: `@message.${string}`;
      timestamp: string;
      user: string;
      role: "user" | "assistant" | "system" | "tool";
      content: unknown;
    };
    export type Input = {
      messages: [Messages.Event, ...Messages.Event[]];
      context: Omit<Session.Context, "messages">;
    };

    export type Handler = ActorLogic<any, Chat.Messages.Event, Input, any, Chat.Say.Event>;
  }

}
