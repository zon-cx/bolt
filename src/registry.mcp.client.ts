import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  CallToolRequestSchema,
  CallToolResultSchema,
  CompatibilityCallToolResultSchema,
  CompleteRequest,
  GetPromptRequest,
  Prompt,
  ReadResourceRequest,
  Request,
  Resource,
  ResourceTemplate,
  ResultSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Atom, createAtom } from "@xstate/store";
import { jsonSchema, type ToolSet } from "ai";
import * as Y from "yjs";
import { MCPClientConnection, TransportFactory } from "./mcp.client";
import { yMapIterate } from "@cxai/stream";
import { Subscription } from "@xstate/store";
import { connectYjs } from "./store.yjs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { env } from "node:process";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
 

 
/**
 * Utility class that aggregates multiple MCP clients into one
 */
export class MCPClientManager {
  public mcpConnections: Record<string, MCPClientConnection> = {};
  public aiTools = createAtom<ToolSet>({});
  public tools = createAtom<NamespacedData["tools"]>([]);
  public prompts = createAtom<NamespacedData["prompts"]>([]);
  public resources = createAtom<NamespacedData["resources"]>([]);
  public resourceTemplates = createAtom<NamespacedData["resourceTemplates"]>(
    []
  );

  /**
   * @param id Name of the MCP client
   * @param version Version of the MCP Client
   * @param store
   */
  constructor(
    public auth: AuthInfo,
    public id: string,
    public version: string,
    public store: Y.Map<serverConfig>
  ) {
    for (const [key, value] of store.entries()) {
      if (!this.mcpConnections[key]) {
        console.log("connecting", key, value);
        const { url } = value;
        this.connect(url, {
          id: key,
        })
          .catch(console.error)
          .then(console.log);
      }
      console.log("exists connection", key, value);
    }
    store.observe((event) => {
      for (const [key, { action }] of event.changes.keys.entries()) {
        if (
          action === "add" ||
          (action === "update" && !this.mcpConnections[key])
        ) {
          console.log("connecting", key);
          const { url } = store.get(key)!;
          this.connect(url, {
            id: key,
          }).catch(console.error);
        }
      }
    });

    this.connect("https://store-mcp.val.run/mcp", {
      id: "store",
    }).catch(console.error);

    env.MCP_REGISTRY_URL && this.connect(env.MCP_REGISTRY_URL, {
      id: "registry",
    }).catch(console.error);
  }

  async *streamConnections(): AsyncGenerator<serverConfig> {
    for await (const [key] of yMapIterate(this.store)) {
      const value = this.store.get(key);
      if (value) {
        yield {
          id: key,
          url: value.url,
          name: value.name,
          version: value.version,
        };
      }
    }
  }

  async listConnections(): Promise<Array<serverConfig & { status: string }>> {
    const iterator = this.streamConnections();
    await iterator.next();
    return Array.from(this.store.entries()).map(([key, value]) => ({
      id: key,
      url: value.url,
      name: value.name,
      version: value.version,
      status:
        this.mcpConnections[key]?.connectionState?.get() ?? "disconnected",
    }));
  }

  /**
   * Connect to and register an MCP server
   *
   * @param url
   * @param options
   */
  async connect(
    url: string,
    options: {
      transport?: TransportFactory;
      client?: ConstructorParameters<typeof Client>[1];
      id?: string;
    } = {}
  ): Promise<MCPClientConnection & serverConfig> {
    const id = options.id || url;

    if (!this.mcpConnections[id]) {
      console.log("new connection", id, url);
      this.mcpConnections[id] = new MCPClientConnection(new URL(url), {
        info: {
          name: this.id,
          version: this.version,
        },
        client: {
          capabilities: {},
        },
        transport: () =>
          new StreamableHTTPClientTransport(new URL(url), {
            requestInit: this.auth?.token ? {
              headers: {
                Authorization: `Bearer ${this.auth.token}`,
              },
            } : undefined,
            // sessionId: this.auth.extra?.sub? `${this.auth.extra.sub}-${this.id}` : undefined,
          }),
        ...options,
      });
    
      this.store.set(id, {
        id,
        url,
        name: this.id,
        version: this.version,
      });
      this.mcpConnections[id].tools.subscribe(() => {
        this.tools.set(getNamespacedData(this.mcpConnections, "tools"));
        this.aiTools.set(this.unstable_getAITools());
      });
      this.mcpConnections[id].prompts.subscribe(() =>
        this.prompts.set(getNamespacedData(this.mcpConnections, "prompts"))
      );
      this.mcpConnections[id].resources.subscribe(() =>
        this.resources.set(getNamespacedData(this.mcpConnections, "resources"))
      );
      this.mcpConnections[id].resourceTemplates.subscribe(() =>
        this.resourceTemplates.set(
          getNamespacedData(this.mcpConnections, "resourceTemplates")
        )
      );

      await this.mcpConnections[id].init();
      console.log("connected", id, url);
    }

    return Object.assign(this.mcpConnections[id], this.store.get(id)!);
  }

  /**
   * @returns namespaced list of tools
   */
  listTools(): NamespacedData["tools"] {
    return this.tools.get();
  }

  /**
   * @returns a set of tools that you can use with the AI SDK
   */
  unstable_getAITools(): ToolSet {
    return Object.fromEntries(
      this.tools.get().map((tool) => {
        return [
          tool.name,
          {
            parameters: jsonSchema(tool.inputSchema),
            description: tool.description,
            execute: async (args) => {
              const result = await this.callTool({
                name: tool.name,
                arguments: args,
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

  onClose(callback: () => void) {
    // This is a placeholder for any cleanup logic you might want to add
    // when the MCPClientManager is closed.
    // For now, it does nothing.
    console.log("MCPClientManager onClose event registered");
  }

  /**
   * Closes a connection to an MCP server
   * @param id The id of the connection to close
   */
  async closeConnection(id: string) {
    if (!this.mcpConnections[id]) {
      throw new Error(`Connection with id "${id}" does not exist.`);
    }
    await this.mcpConnections[id].client.close();
    delete this.mcpConnections[id];
  }

  /**
   * @returns namespaced list of prompts
   */
  listPrompts(): NamespacedData["prompts"] {
    return this.prompts.get();
  }

  /**
   * @returns namespaced list of tools
   */
  listResources(): NamespacedData["resources"] {
    return this.resources.get();
  }

  /**
   * @returns namespaced list of resource templates
   */
  listResourceTemplates(): NamespacedData["resourceTemplates"] {
    return this.resourceTemplates.get();
  }

  /**
   * Namespaced version of
   */
  async callTool(
    { name, ...params }: Zod.infer<typeof CallToolRequestSchema>["params"],
    resultSchema?:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema,
    options?: RequestOptions
  ) {
    console.log(
      "call-tool",
      name,
      getNamespacedData(this.mcpConnections, "tools").map(
        ({ name, serverId, key, source }) => ({
          key,
          name,
          source,
        })
      )
    );

    const tool = await findSourceAsync(this.tools, name);
    console.log(
      "call-tool",
      name,
      getNamespacedData(this.mcpConnections, "tools").map(
        ({ name, serverId, key, source }) => ({
          key,
          name,
          serverId,
          source,
        })
      ),
      this.tools.get().map(({ name, source }) => ({ source, name })),
      "connections",
      Object.keys(this.mcpConnections),
      "stote",
      Array.from(this.store.keys()),
      tool
    );

    if (!tool) {
      throw new Error(`Tool with name "${name}" does not exist.`);
    }

    console.log("Tool found", tool);

    return this.mcpConnections[tool.server].client.callTool(
      {
        ...params,
        name: tool.name,
      },
      resultSchema,
      options
    );
  }

  async complete(
    { ref, ...params }: CompleteRequest["params"],
    options?: RequestOptions
  ): Promise<any> {
    const source =
      ref.type === "ref/resource"
        ? await findSourceAsync(this.resources, ref.uri)
        : await findSourceAsync(this.prompts, ref.name);

    if (!source || !source.server) {
      throw new Error(
        `No MCP client found for resource name: ${ref.name}  URI: ${ref.uri}  URI Template: ${ref.uriTemplate}`
      );
    }
    return this.mcpConnections[source.server].client.complete(
      {
        ...params,
        ref: {
          ...ref,
          ...source,
        },
      },
      options
    );
  }

  /**
   * Namespaced version of readResource
   */
  async readResource(
    params: ReadResourceRequest["params"],
    options?: RequestOptions
  ) {
    const source = await findSourceAsync(this.resources, params.uri);
    return await this.mcpConnections[source.server].client.readResource(
      {
        ...params,
        ...source,
      },
      options
    );
  }

  /**
   * Namespaced version of getPrompt
   */
  async getPrompt(
    params: GetPromptRequest["params"],
    options?: RequestOptions
  ) {
    const { server, name } = await findSourceAsync(this.prompts, params.name);
    return await this.mcpConnections[server].client.getPrompt(
      {
        ...params,
        name,
      },
      options
    );
  }

  bindToMcpServer(mcpServer: Server) {
    const subscriptions: Subscription[] = [
      this.tools.subscribe(() => {
        if (this.tools.get()) mcpServer.sendToolListChanged();
      }),
      this.prompts.subscribe(() => {
        if (this.prompts.get()) mcpServer.sendPromptListChanged();
      }),
      this.resources.subscribe(() => {
        if (this.resources.get()) mcpServer.sendResourceListChanged();
      }),
      this.resourceTemplates.subscribe(() => {
        if (this.resourceTemplates.get()) mcpServer.sendResourceListChanged();
      }),
    ];
    this.onClose(() => {
      console.log("Agent closed", this.id);
      subscriptions.forEach((sub) => {
        sub.unsubscribe();
      });
    });
  }
}

type NamespacedSource = {
  name: string;
  source: {
    name: string;
    url: string;
    server: string;
  };
};

type NamespacedData = {
  tools: (Tool & NamespacedSource)[];
  prompts: (Prompt & NamespacedSource)[];
  resources: (Resource & NamespacedSource)[];
  resourceTemplates: (ResourceTemplate & NamespacedSource)[];
};

export function getNamespacedData<T extends keyof NamespacedData>(
  mcpClients: Record<string, MCPClientConnection>,
  type: T
): NamespacedData[T] {
  const sets = Object.entries(mcpClients).map(([name, conn]) => {
    return { name, data: conn[type] };
  });

  const namespacedData = sets.flatMap(({ name: server, data }) => {
    if (!data || typeof data.get !== "function") {
      console.warn(
        `Data for ${type} in client ${server} is not an Atom or doesn't have a get method`
      );
      return [];
    }

    try {
      return (
        data.get()?.map((resource: any) => {
          const { name, uri, uriTemplate, ...item } = resource;
          let resourceUri: string | undefined = undefined;
          if (typeof uri === "string") {
            resourceUri = uri;
          } else if (typeof uriTemplate === "string") {
            resourceUri = uriTemplate;
          }
          return {
            ...item,
            name: `${server}:${name}`,
            uri: resourceUri ? `${server}:${resourceUri}` : undefined,
            source: {
              uri: resourceUri,
              name,
              server,
            },
          };
        }) || []
      );
    } catch (error) {
      console.error(`Error getting ${type} data from client ${server}:`, error);
      return [];
    }
  });

  return namespacedData as NamespacedData[T]; // Type assertion needed due to TS limitations with conditional return types
}

async function findSourceAsync<
  T extends NamespacedData[keyof NamespacedData][number] = NamespacedData[keyof NamespacedData][number]
>(
  atom: Atom<T[]>,
  name: string
): Promise<{ name: string; server: string; uri?: string }> {
  const result = await findAsync(
    atom,
    (value) =>
      (value && value.name === name) ||
      value.uri === name ||
      value.uriTemplate === name
  );
  if (!result || !result.source) {
    throw new Error(
      `Resource with uri '${name}' not found in any MCP client connection.`
    );
  }
  return {
    name: (result.source as any).name,
    server: (result.source as any).server,
    uri: (result.source as any).uri,
  };

  async function findAsync<T extends any = any>(
    atom: Atom<T[]>,
    predicate: (value: T) => boolean
  ): Promise<T | undefined> {
    return new Promise((resolve) => {
      function onAtomChange() {
        const value = atom.get().find(predicate);
        if (value) {
          resolve(value);
        }
      }

      onAtomChange();
      atom.subscribe(onAtomChange);
    });
  }
}

 
export type serverConfig = {
  id: string;
  url: string;
  name: string;
  version: string;
};




