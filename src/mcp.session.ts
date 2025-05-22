import type {
  CallToolRequest,
  CallToolResultSchema,
  CompatibilityCallToolResultSchema,
  ReadResourceRequest,
  GetPromptRequest,
  Tool,
  Resource,
  Prompt,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { jsonSchema, type ToolSet } from "ai";
import { nanoid } from "nanoid";
import { MCPClientConnection } from "./mcp.client";
import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { connectYjs } from "./assistant.store";
import * as Y from "yjs";



/**
 * Utility class that aggregates multiple MCP clients into one
 */
export class MCPClientManager {
  public mcpConnections: Record<string, MCPClientConnection> = {};

  /**
   * @param _name Name of the MCP client
   * @param _version Version of the MCP Client
   * @param auth Auth paramters if being used to create a DurableObjectOAuthClientProvider
   */
  constructor(private _name: string, private _version: string, public  store: Y.Map<serverConfig>) {
    
    for(const [key, value] of store.entries()){
       if(!this.mcpConnections[key]) {
        const {url}= value;
        this.connect(url, {
          id:key 
        });
      }
    }
    store.observe((event) => {
        for (const [key, {action}] of event.changes.keys.entries()) {
            if (action === "add" || action === "update" && !this.mcpConnections[key]) {
              const {url}= store.get(key)!;
              this.connect(url, {
                id:key 
              });
            }
            if(action === "delete" && this.mcpConnections[key]){
              this.closeConnection(key);
              delete this.mcpConnections[key];
            } 
        }
    });
  } 

  /**
   * Connect to and register an MCP server
   *
   * @param transportConfig Transport config
   * @param clientConfig Client config
   * @param capabilities Client capabilities (i.e. if the client supports roots/sampling)
   */
  async connect(
    url: string,
    options: {
      transport?: Transport;
      client?: ConstructorParameters<typeof Client>[1];
      id?: string;
    } = {}
  ): Promise<void> {
    const id= options.id || url;

    if (!this.mcpConnections[id]) {
      this.mcpConnections[id] = new MCPClientConnection(new URL(url), {
        info: {
          name: this._name,
          version: this._version,
        },
        ...options,
      });
      this.store.set(id, {
        id,
        url,
        name: this._name,
        version: this._version,
      });
      await this.mcpConnections[id].init();
  
    }
  }

  /**
   * @returns namespaced list of tools
   */
  listTools(): NamespacedData["tools"] {
    return getNamespacedData(this.mcpConnections, "tools");
  }

  /**
   * @returns a set of tools that you can use with the AI SDK
   */
  unstable_getAITools(): ToolSet {
    return Object.fromEntries(
      getNamespacedData(this.mcpConnections, "tools").map((tool) => {
        return [
          `${tool.serverId}_${tool.name}`,
          {
            parameters: jsonSchema(tool.inputSchema),
            description: tool.description,
            execute: async (args) => {
              const result = await this.callTool({
                name: tool.name,
                arguments: args,
                serverId: tool.serverId,
              });
              if (result.isError) {
                // @ts-expect-error TODO we should fix this
                throw new Error(result.content[0].text);
              }
              return result;
            },
          },
        ];
      })
    );
  }

  /**
   * Closes all connections to MCP servers
   */
  async closeAllConnections() {
    return Promise.all(
      Object.values(this.mcpConnections).map(async (connection) => {
        await connection.client.close();
      })
    );
  }

  /**
   * Closes a connection to an MCP server
   * @param id The id of the connection to close
   */
  async closeConnection(url: string) {
    if (!this.mcpConnections[url]) {
      throw new Error(`Connection with id "${url}" does not exist.`);
    }
    await this.mcpConnections[url].client.close();
  }

  /**
   * @returns namespaced list of prompts
   */
  listPrompts(): NamespacedData["prompts"] {
    return getNamespacedData(this.mcpConnections, "prompts");
  }

  /**
   * @returns namespaced list of tools
   */
  listResources(): NamespacedData["resources"] {
    return getNamespacedData(this.mcpConnections, "resources");
  }

  /**
   * @returns namespaced list of resource templates
   */
  listResourceTemplates(): NamespacedData["resourceTemplates"] {
    return getNamespacedData(this.mcpConnections, "resourceTemplates");
  }

  /**
   * Namespaced version of callTool
   */
  callTool(
    params: CallToolRequest["params"] & { serverId: string },
    resultSchema?:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema,
    options?: RequestOptions
  ) {
    const unqualifiedName = params.name.replace(`${params.serverId}.`, "");
    return this.mcpConnections[params.serverId].client.callTool(
      {
        ...params,
        name: unqualifiedName,
      },
      resultSchema,
      options
    );
  }

  /**
   * Namespaced version of readResource
   */
  readResource(
    params: ReadResourceRequest["params"] & { serverId: string },
    options: RequestOptions
  ) {
    return this.mcpConnections[params.serverId].client.readResource(
      params,
      options
    );
  }

  /**
   * Namespaced version of getPrompt
   */
  getPrompt(
    params: GetPromptRequest["params"] & { serverId: string },
    options: RequestOptions
  ) {
    return this.mcpConnections[params.serverId].client.getPrompt(
      params,
      options
    );
  }
}

type NamespacedData = {
  tools: (Tool & { serverId: string })[];
  prompts: (Prompt & { serverId: string })[];
  resources: (Resource & { serverId: string })[];
  resourceTemplates: (ResourceTemplate & { serverId: string })[];
};

export function getNamespacedData<T extends keyof NamespacedData>(
  mcpClients: Record<string, MCPClientConnection>,
  type: T
): NamespacedData[T] {
  const sets = Object.entries(mcpClients).map(([name, conn]) => {
    return { name, data: conn[type] };
  });

  const namespacedData = sets.flatMap(({ name: serverId, data }) => {
    return data.get()?.map((item) => {
      return {
        ...item,
        // we add a serverId so we can easily pull it out and send the tool call to the right server
        serverId,
      };
    });
  });

  return namespacedData as NamespacedData[T]; // Type assertion needed due to TS limitations with conditional return types
}


export const mcpSessions: Record<string, MCPClientManager> = {};


type  serverConfig =  {
  id: string,
  url: string,
  name: string,
  version: string
}

const doc= connectYjs("mcpSessions");
const userServerStore=(user:string)=>{
  return doc.getMap<serverConfig>(`servers:${user}`)
}

export function createMcpSession(id:string){
  const session= new MCPClientManager("assistant", "1.0.0", userServerStore(id));
  mcpSessions[id]= session;
  return session;
}

export function getMcpSession(id:string){
  return mcpSessions[id];
}
export function getOrCreateMcpSession(id:string){
  return mcpSessions[id] || createMcpSession(id);
}

