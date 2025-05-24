import { fromEventAsyncGenerator } from "@cxai/stream";
import { jsonSchema, generateObject, streamText, smoothStream } from "ai";
import { azure } from "@ai-sdk/azure";
import {  ActorLogic, waitFor } from "xstate";
import { Chat } from "./chat";
import { Session } from "./chat.handler.thread";
import { Tools } from "./chat.handler.thread";
import { MCPClientManager } from "./gateway.mcp.connection";
import { MCPClientConnection } from "./gateway.mcp.client";
import { aiTools } from "./chat.mcp.client";
 import {Client as McpClient} from "@modelcontextprotocol/sdk/client/index.js";

export function fromMcpBootstrap(client:McpClient){
 return fromEventAsyncGenerator(async function* ({
  input,
  system
}): AsyncGenerator<Chat.Say.Event | Tools.Event> {

  const tools= await aiTools(client);

  yield {
    type: "@tool.available",
    tools: tools ,
  };

  console.log("mcp connected.\ttools:",tools);

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
    maxSteps: 10,
    experimental_continueSteps: true,
    experimental_transform: smoothStream({ chunking: "line" }),
    maxRetries: 0,
    toolChoice: "auto",
   });

  for await (const event of fullStream) {
    if (event.type === "tool-call") {
      console.log("tool-call-event",event.toolName);
      yield {
        ...event,
        type: "@tool.call",
      };
    }
    if (event.type === "tool-result") {
      console.log("tool-result-event",event.toolName);
      yield {
        ...event,
        type: "@tool.result",
      };
    }
    if (event.type === "text-delta") {
      // console.log("text-delta-event",event.textDelta);
      // textBuffer += event.textDelta;
      // if (textBuffer.includes("\n") || textBuffer.includes("```")) {
        yield {
          type: "@chat.message",
          message: event.textDelta,
        };
        // textBuffer = "";
      }
    }

  console.log("llm stream done.","hello",await hello);
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