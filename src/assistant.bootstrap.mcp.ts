import { asyncBatchEvents, fromEventAsyncGenerator } from "@cxai/stream";
import {jsonSchema, generateObject, generateText, streamText} from "ai";
import { azure } from "@ai-sdk/azure";
import messageBuilder from "./slack.messages";
import { Communication, Session} from "./assistant";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient as createMCPClient } from "ai";
import { Input } from "./assistant.bootstrap";



const prompter = fromEventAsyncGenerator(async function* ({input}:{input:Session.Input}): AsyncGenerator<Communication.Event> {
  const mcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(
      new URL(process.env.MCP_SERVER_URL!),
      {
        requestInit: {
          headers: {
            Authorization: "Bearer YOUR TOKEN HERE",
          },
        },
      }),
    })

  const tools = await mcpClient.tools();
  
  const {text:hello, fullStream} = await streamText({
    model: azure("gpt-4o"),
    system: "You are a helpful assistant in a slack channel.",
    prompt: `this is the start of the conversation, you need to say hello to the user and suggest 3 prompts for the user to choose from.
               example: Hello 🏴‍☠️! I'm Jeki your personal stylist, I can help you look your best! use the available tools understand what you can do.
                """${Object.entries(tools).map(([name,tool])=>`${name}: ${tool.description}`).join("\n")}"""
               `,
               tools,
               maxRetries: 10,
               maxSteps: 20, // give the model enough room for tool → result → follow-up,

  });

  let textBuffer= ""

  for await (const event of fullStream) {
    if (event.type === "tool-call") {
       yield {
        ...event,
        type: "@tool.call",
        name: event.toolName,
        args: event.args 
       }
    }
    if (event.type === "tool-result") {
      yield {
        ...event,
        type: "@tool.result",
        name: event.toolName,
        result: event.result 
      }
    }
    if (event.type === "text-delta") {
      textBuffer += event.textDelta
      if(textBuffer.includes("\n") || textBuffer.includes("```")) {
        yield {
          type: "say",
          message: {
            text: textBuffer
          }
        }
        textBuffer= ""
      }
    }
  }

  
  const { object:{  title, prompts } } = await generateObject< { title:string, prompts:Communication.Prompts["prompts"]}>({
    model: azure("gpt-4o"),
    system: "You are a helpful assistant in a slack channel.",
    prompt: `this is the start of the conversation, you just said hello to user with "${await hello}", suggest 3 prompts for the user to choose from - keep it related to your welcome message.
             important! use the available tools understand what you can do and generate the prompts accordingly. """${Object.entries(tools).map(([name,tool])=>`${name}: ${tool.description}`).join("\n")}"""
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

  yield { type: "prompts",  prompts, title};
});

export default prompter as unknown as  Session.Bootstrap


