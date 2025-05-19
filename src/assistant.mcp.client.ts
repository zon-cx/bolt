import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient as createMCPClient, Tool, ToolCall, ToolResult } from "ai";
import { createMachine, fromPromise } from "xstate";




type McpClient = Awaited<ReturnType<typeof createMCPClient>>
type McpTool = Awaited<ReturnType<McpClient["tools"]>>[0]

export default createMachine({
  id: "mcpClient",
  initial: "init",
  types:{} as{
    input: Parameters<typeof createMCPClient>[0],
    context: {
      options: Parameters<typeof createMCPClient>[0],
      tools: McpTool[]
      client?: McpClient 
    }
  },
  context: ({input}) => ({
    options:input,
    tools:[] as McpTool[]
  }),
  states: {
    init: {
      invoke: {
        src: fromPromise(
          async ({ input }: { input?: StreamableHTTPClientTransportOptions }) => {
            try{
                console.log("creating client");
              const client = await createMCPClient({
              transport: new StreamableHTTPClientTransport(
                new URL(process.env.MCP_SERVER_URL!),
                {
                  requestInit: {
                    headers: {
                      Authorization: "Bearer YOUR TOKEN HERE",
                    },
                  },
                  ...(input || {}),
                }
              ),
            });
            console.log("client created",client);
            return client;
          } catch (error) {
            console.error("Failed to create MCP client", error);
            throw new Error("Failed to create MCP client",{cause:error});
          }
        }),
        onDone: {
          actions: ({context,event:{output}}) => {
            context.client = output
          },
          target: "connected" 
        }
      }
    },
      connected: {
        invoke: {
          src: fromPromise(async ({input}) => {
            const tools = await input.client?.tools()
            return tools
          }),
          input: ({context}) => context,
          onDone: {
            actions: ({context,event:{output}}) => {
              context.tools = output
            }
          }
        }
      } 
    },
  },
)

export namespace Tools {
  export type ToolAvailableEvent = {
   type: "@tool.available"; 
   tools: {[key: string]: Tool}
 } 
 export type ToolCallEvent = {
   type: "@tool.call";
 } & ToolCall<string, unknown>
 export type ToolResultEvent = {
   type: "@tool.result";
 } & ToolResult<string, unknown, unknown>

 export type Event =   ToolAvailableEvent | ToolCallEvent | ToolResultEvent

}


