import { jsonSchema,  Schema,  tool, ToolExecutionOptions } from "ai";
import {  CallToolResult, CallToolResultSchema, Tool as McpTool} from "@modelcontextprotocol/sdk/types.js";
import { MCPClient } from "./mcp.client";
import {z} from "zod";
export async function aiTools<TOOLS extends McpTool[]>(client:MCPClient) {
    const {tools}= client.getSnapshot().context;
    return tools.reduce(
      (acc, t) => ({
        ...acc,
        [t.name.replace(":","_").replace("@","_")]: toTool(t, client),
      }),
      {} as MCPToolSet<TOOLS>
    );
  
    function toTool(
      { name, description, inputSchema }: McpTool,
      client: MCPClient
    ) {
      const parameters =jsonSchema({
        ...inputSchema,
        properties: inputSchema.properties ?? {},
        additionalProperties: false,
      })

      return tool({ 
        parameters,
        description,
        execute: async (
          args: inferParameters<typeof parameters>,
          options: ToolExecutionOptions,
        ): Promise<CallToolResult> => {
          console.log("tool-execute",args,options);

          options?.abortSignal?.throwIfAborted();
          console.log("tool-execute-not-aborted",args,options);

          // options?.abortSignal?.throwIfAborted();
          const result = await client.getSnapshot().context.client!.request({ method: 'tools/call', params: { name, arguments: args } },
            CallToolResultSchema,
            {
              signal: options?.abortSignal,
            },
          );
          console.log("tool-execute-result",result);
          return result;
        },
      });
    }
  
    type MCPToolMap<T extends McpTool[]> = {
      [key in T[number]["name"]]: T[number];
    };
  
    type MCPToolSet<T extends McpTool[]> = {
      [key in T[number]["name"]]: {
        name: MCPToolMap<T>[key];
        description: MCPToolMap<T>[key]["description"];
        parameters: ReturnType<
          typeof jsonSchema<{
            [key: string]: unknown;
          }>
        >;
        execute: (
          args: Record<string, unknown>,
          options: ToolExecutionOptions
        ) => Promise<unknown>;
      };
    };
  }
  

  export type ToolParameters = z.ZodTypeAny | Schema<any>;

export type inferParameters<PARAMETERS extends ToolParameters> =
PARAMETERS extends Schema<any>
  ? PARAMETERS['_type']
  : PARAMETERS extends z.ZodTypeAny
    ? z.infer<PARAMETERS>
    : never;