import { fromEventAsyncGenerator } from "@cxai/stream";
import { jsonSchema, generateObject, streamText } from "ai";
import { azure } from "@ai-sdk/azure";
import {  ActorLogic, waitFor } from "xstate";
import { Chat } from "./assistant.chat";
import { Session } from "./assistant";
import { Tools } from "./assistant.mcp.client";
import { MCPClientManager } from "./mcp.session";
 

export function fromMcpBootstrap(session:MCPClientManager){
 return fromEventAsyncGenerator(async function* ({
  input,
  system
}): AsyncGenerator<Chat.Say.Event | Tools.Event> {

  const tools= session.unstable_getAITools();
  yield {
    type: "@tool.available",
    tools: tools ,
  };



  const { text: hello, fullStream } = await streamText({
    model: azure("gpt-4o"),
    system: "You are a helpful assistant in a slack channel.",
    prompt: `this is the start of the conversation, you need to say hello to the user and suggest 3 prompts for the user to choose from.
             example: Hello 🏴‍☠️! I'm Jeki your personal stylist, I can help you look your best! use the available tools understand what you can do.
              """${Object.entries(tools)
                .map(([name, tool]) => `${name}: ${tool.description}`)
                .join("\n")}"""
             `,
    tools,
    maxRetries: 10,
    maxSteps: 20, // give the model enough room for tool → result → follow-up,
  });

  let textBuffer = "";

  for await (const event of fullStream) {
    if (event.type === "tool-call") {
      yield {
        ...event,
        type: "@tool.call",
      };
    }
    if (event.type === "tool-result") {
      yield {
        ...event,
        type: "@tool.result",
      };
    }
    if (event.type === "text-delta") {
      textBuffer += event.textDelta;
      if (textBuffer.includes("\n") || textBuffer.includes("```")) {
        yield {
          type: "@chat.message",
          message: textBuffer,
        };
        textBuffer = "";
      }
    }
  }

  const {
    object: { title, prompts },
  } = await generateObject<{
    title: string;
    prompts: Chat.Say.Prompts["prompts"];
  }>({
    model: azure("gpt-4o"),
    system: "You are a helpful assistant in a slack channel.",
    prompt: `this is the start of the conversation, you just said hello to user with "${await hello}", suggest 3 prompts for the user to choose from - keep it related to your welcome message.
           important! use the available tools understand what you can do and generate the prompts accordingly. """${Object.entries(
             tools
           )
             .map(([name, tool]) => `${name}: ${tool.description}`)
             .join("\n")}"""
              example:{ 
               title: "Here some prompts example to help you get started",
               prompts: [
                 { title: "Help me decide between two dresses",
                   message: "I'm trying to decide between two dresses, which one should I wear?"
                 },
                 { title: "Help me find a matching jewlery",
                   message: "I'm trying to find a matching jewlery for my dress, can you help me?"
                 },
                 { title: "What's the best color for my skin tone?",
                   message: "I'm trying to find the best color for my skin tone?" } ] } `,
    schema: jsonSchema({
      type: "object",
      properties: {
        title: {
          type: "string",
          description: `the title of the prompt, for example: Here some prompts example to help you get started `,
        },
        prompts: {
          type: "array",
          minItems: 3,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              message: { type: "string" },
            },
            required: ["title", "message"],
          },
        },
      },
      required: ["title", "prompts"],
    }),
  });

  yield { type: "@chat.prompts", prompts, title };
}) as unknown as Bootstrap
}
export default fromMcpBootstrap


export type Bootstrap = ActorLogic<
any,
Chat.Say.Event | Tools.Event,
Session.Input,
any,
Chat.Messages.Event | Tools.Event
>;