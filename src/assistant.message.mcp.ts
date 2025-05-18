import { fromEventAsyncGenerator } from "@cxai/stream";
import { generateObject, generateText, Tool, ToolExecutionError } from "ai";
import { azure } from "@ai-sdk/azure";
import { experimental_createMCPClient as createMCPClient } from "ai";
import { Communication, Messages } from "./assistant";

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
// new StdioMCPTransport({
//     command: "npx",
//     args: ["@modelcontextprotocol/server-slack", "-y", "--port", "3000"],
//     env: {
//       SLACK_BOT_TOKEN: env.SLACK_BOT_TOKEN!,
//       SLACK_TEAM_ID: env.SLACK_TEAM_ID!,
//     },
//   })
const mcpClient = await createMCPClient({
  transport: new StreamableHTTPClientTransport(
    new URL(process.env.MCP_SERVER_URL!),
    {
      requestInit: {
        headers: {
          Authorization: "Bearer YOUR TOKEN HERE",
        },
      },
      // transport: new SSEClientTransport(
      //     new URL(process.env.MCP_SERVER_URL!), {
      //   requestInit: {
      //     headers: {
      //       Authorization: "Bearer YOUR TOKEN HERE",
      //   },
      // },
      // TODO add OAuth client provider if you want
    //   authProvider:  new OAuthClientProvider({
    //     clientId: process.env.MCP_CLIENT_ID!,
    //     clientSecret: process.env.MCP_CLIENT_SECRET!,
    //     redirectUri: process.env.MCP_REDIRECT_URI!,
    //   }),
    }
  ),
});

/**
 * Extend the generic MessageInput with an optional prompt field.
 * All other properties come from the parent assistant implementation.
 */
export type MCPMessageInput = {
  /**
   * Optional override prompt that gets appended to the chat history before
   * generation.
   */
  prompt?: string;
  serverUrl?: string;
} & Messages.Input;

/**
 * A new assistant message handler that is capable of using Model Context
 * Protocol (MCP) tools. The handler
 *
 * 1. Connects to the configured MCP server (via the experimental AI-SDK helper).
 * 2. Discovers the server tools and forwards them to the language model.
 * 3. Allows the model to autonomously decide when to call the tools. The AI-SDK
 *    will execute the tool calls, collect their results and automatically feed
 *    them back to the model until the conversation finishes.
 * 4. Emits Communication.Event objects so the surrounding state-machine can
 *    update the UI (status → say → title).
 */
const mcpMessage = fromEventAsyncGenerator(async function* ({
  input: { prompt, messages, context },
}: {
  input: MCPMessageInput;
}): AsyncGenerator<Communication.Event> {
  // 1. Inform UI that we are about to connect to the tool server
  yield { type: "status", status: "connecting to tool server…" };

  // Fetch the list of tools that the server exposes. We do not provide
  // explicit schemas here – discovery mode will infer them for us.
  const tools = await mcpClient.tools();

  yield {
    type: "@tool.available",
    tools: tools ,
  };

  const count = Object.keys(tools).length;
  yield {
    type: "status",
    status: `connected – ${count} tool${count === 1 ? "" : "s"} available`,
  };

  // 2. Tell the UI that the assistant is thinking.
  yield { type: "status", status: "generating response…" };

  // Helper that tries to fix invalid tool calls (wrong / missing arguments
  // or unknown tool names) by asking the LLM to rewrite the call.

  // Attempt the call up to 3 times if the tool itself fails during execution.

  try {
    const { text, toolResults, toolCalls } = await generateText({
      model: azure("gpt-4o"),
      messages: [...messages],
      prompt,
      tools,
      maxRetries: 10,
      maxSteps: 20, // give the model enough room for tool → result → follow-up,
    //   onStepFinish: (step) => {
    //     console.log("step", step);
    //   },
    //   async experimental_prepareStep(options) {
    //     console.log("prepareStep", options);
    //     return options;
    //   },
    //   experimental_repairToolCall: repairToolCall,
    });
    yield { type: "say", message: text };

    for (const [key, toolResult] of Object.entries(toolResults)) {
      yield { ...toolResult, type: "@tool.result", name: key };
    }

    for (const [key, toolCall] of Object.entries(toolCalls)) {
      yield {
        ...toolCall,
        type: "@tool.call",
        name: key,
        args: toolCall.args as Record<string, unknown>,
      };
    }
  } catch (err) {
    console.error("Something went wrong", err);
    yield {
      type: "say",
      message: "Something went wrong. " + "error: " + (err as Error).message,
    };
  }

  return "done";
});

export default mcpMessage as unknown as Messages.Handler;

