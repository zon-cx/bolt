import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  experimental_createMCPClient as createMCPClient,
  Tool,
  ToolCall,
  ToolResult,
} from "ai";
import {
  assertEvent,
  assign,
  createMachine,
  fromCallback,
  fromPromise,
} from "xstate";
import { MCPClientConnection } from "../gateway/mcp.connect";
import { Atom, createStore } from "@xstate/store";
import { MCPClientManager } from "./mcp.session";

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;
type McpTool = Awaited<ReturnType<McpClient["tools"]>>[0];
type McpResource = Awaited<ReturnType<McpClient["resources"]>>[0];
type McpPrompt = Awaited<ReturnType<McpClient["prompts"]>>[0];
type McpResourceTemplate = Awaited<
  ReturnType<McpClient["resourceTemplates"]>
>[0];

type McpClientEvent =
  | {
      type: "connected";
      tools: McpTool[];
      resources: McpResource[];
      prompts: McpPrompt[];
      resourceTemplates: McpResourceTemplate[];
    }
  | {
      type: "error";
      error: Error;
    }
  | {
      type: "tools";
      tools: McpTool[];
    }
  | {
      type: "resources";
      resources: McpResource[];
    }
  | {
      type: "prompts";
      prompts: McpPrompt[];
    }
  | {
      type: "resourceTemplates";
      resourceTemplates: McpResourceTemplate[];
    }
  | {
      type: "callTool";
      params: Parameters<InstanceType<typeof MCPClientManager>["callTool"]>[0];
      resultSchema: Parameters<
        InstanceType<typeof MCPClientManager>["callTool"]
      >[1];
      options: Parameters<InstanceType<typeof MCPClientManager>["callTool"]>[2];
      resolve?: (
        result: Awaited<
          ReturnType<InstanceType<typeof MCPClientManager>["callTool"]>
        >
      ) => void;
      reject?: (error: Error) => void;
    }
  | {
      type: "callToolResult";
      result: Awaited<
        ReturnType<InstanceType<typeof MCPClientManager>["callTool"]>
      >;
    }
  | {
      type: "callToolError";
      error: Error;
    };

export default createMachine({
  id: "mcpClient",
  types: {} as {
    input: Parameters<typeof createMCPClient>[0];
    events: McpClientEvent;
    context: {
      options: Parameters<typeof createMCPClient>[0];
      tools: McpTool[];
      aiTools: Record<string, Tool>;
      resources: McpResource[];
      prompts: McpPrompt[];
      resourceTemplates: McpResourceTemplate[];
    };
  },
  context: ({ input }) => ({
    options: input,
    tools: [],
    resources: [],
    prompts: [],
    resourceTemplates: [],
    aiTools: {},
  }),
  invoke: {
    src: fromCallback<McpClientEvent, MCPClientConnection, McpClientEvent>(
      ({ input: connection, sendBack, receive }) => {
        async function init() {
          await connection.init();
          const { tools, resources, prompts, resourceTemplates } = connection;
          sendBack({
            type: "connected",
            tools,
            resources,
            prompts,
            resourceTemplates,
          });
          tools.subscribe((tools) => {
            sendBack({ type: "tools", tools });
          });
          resources.subscribe((resources) => {
            sendBack({ type: "resources", resources });
          });
          prompts.subscribe((prompts) => {
            sendBack({ type: "prompts", prompts });
          });
          resourceTemplates.subscribe((resourceTemplates) => {
            sendBack({ type: "resourceTemplates", resourceTemplates });
          });
        }
        init().catch((error) => {
          console.error("Failed to create MCP client", error);
          sendBack({ type: "error", error });
        });

        receive((event) => {
          if (event.type == "callTool") {
            const { params, resultSchema, options, resolve, reject } =
              event as McpClientEvent & { type: "callTool" };

            async function callTool() {
              const result = await connection.client.callTool(
                params,
                resultSchema,
                options
              );
              resolve?.(result);
              sendBack({ type: "callToolResult", result });
            }

            callTool().catch((error) => {
              reject?.(error);
              sendBack({ type: "callToolError", error });
            });
          }
        });
      }
    ),
  },
  on: {
    connected: {
      actions: assign(({ event }) => {
        assertEvent(event, "connected");
        return event;
      }),
    },
    tools: {
      actions: [
        assign({
          tools: ({ event: { tools } }) => tools,
        }),
      ],
    },
    resources: {
      actions: assign({
        resources: ({ event: { resources } }) => resources,
      }),
    },
    prompts: {
      actions: assign({
        prompts: ({ event: { prompts } }) => prompts,
      }),
    },
    resourceTemplates: {
      actions: assign({
        resourceTemplates: ({ event: { resourceTemplates } }) =>
          resourceTemplates,
      }),
    },
  },
});

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
