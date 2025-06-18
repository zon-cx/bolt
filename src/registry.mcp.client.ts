import { auth, OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import type { RequestHandlerExtra, RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequest,
  CallToolResult,
  ResourceUpdatedNotificationSchema,
  type CallToolRequestSchema,
  type CallToolResultSchema,
  type CompatibilityCallToolResultSchema,
  type CompleteRequest,
  type GetPromptRequest,
  type Prompt,
  type ReadResourceRequest,
  type Request,
  type Resource,
  type ResourceTemplate,
  type ResultSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Atom, createAtom } from "@xstate/store";
import { jsonSchema, type ToolSet } from "ai";
import * as Y from "yjs";
import { MCPClientConnection, TransportFactory } from "./mcp.client";
import { yMapIterate } from "@cxai/stream";
import { Subscription } from "@xstate/store";
import { connectYjs } from "./store.yjs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { env, version } from "node:process";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListConnectionsResultSchema } from "./registry.mcp.server";
import { z } from "zod";
import EventEmitter from "node:events";

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

export type serverConfig = {
  id: string;
  url: string;
  name?: string;
  version?: string;
};

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
  public connected = new EventEmitter();
  public store: Y.Map<serverConfig>;
  private clientCache: Map<string, { client: Client; transport: StreamableHTTPClientTransport; lastUsed: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute
  /**
   * @param id Name of the MCP client
   * @param version Version of the MCP Client
   * @param store
   */
  constructor(
  public session: {store: Y.Map<serverConfig>, auth: AuthInfo, session?: string, id?: string, name?: string, version?: string}
  ) {
    this.store = this.session.store; 
    this.store.observe(async (event) => {
      for (const [key] of event.changes.keys.entries()) {
        if (this.store.get(key) && !this.mcpConnections[key]) {
           await this.attemptConnection(this.store.get(key)!);
        }
      }
    });

    // Start cleanup interval
    setInterval(() => {
      this.cleanupExpiredClients();
    }, this.CLEANUP_INTERVAL);
  }

  async updateFromRegistry(connection: MCPClientConnection) {
    const callback = async function updateStore(this: MCPClientManager) {
      try {
        console.log("updateFromRegistry", connection.name);
        const {resources} = await connection.client.listResources();
        const serverResources = resources.filter(
          (resource) => resource.uri.includes("urn:mcp:server/")
        );
        console.log("serverResources", serverResources,resources);

        for (const resource of serverResources) {
          try {
            const {uri, name} = resource;
            const serverResponse = await connection.client.readResource({uri});
            
            if (serverResponse.contents?.[0]) {
              const serverData = JSON.parse(serverResponse.contents[0].text as string);
              console.log("add connection", serverData);
              const existingConnection = this.store.get(serverData.id);
              if (existingConnection && existingConnection.url === serverData.url && existingConnection.id === serverData.id) {
                  console.log("Connection already exists", existingConnection);
                  continue; // Skip if the connection already exists with the same URL
              }
              if (serverData.id && serverData.url ) {
                await this.addConnection({
                  id: serverData.id,
                  url: serverData.url,
                  name: serverData.name || name,
                  version: serverData.version
                });
              }
            }
          } catch (error) {
            console.error(`Error processing server resource ${resource.uri}:`, error);
          }
        }
      } catch (error) {
        console.error("Error updating from registry:", error);
      }
    }.bind(this);

    await callback();

    return connection.resources.subscribe(callback);
  }

  async  attemptConnection(connection:serverConfig) {
    console.log(" connecting", connection.id);
    const c = await this.connect(connection).then((c)=>{
      console.log("🔗 connected", connection.id, c.connectionState.get() , c.error?.get());
      this.store.set(connection.id, {
        ...this.store.get(connection.id)!,
        error: c.error?.get(),
        status: c.connectionState.get(),
      })  
      return c;
    })
    .catch((e)=>{
      console.error("❌ error connecting", connection.id, e,this.store.get(connection.id));
      this.store.set(connection.id, {
        ...this.store.get(connection.id)!,
        ...connection,
        error: {
          message: "message" in e ? e.message : "unknown error",
          stack: "stack" in e ? e.stack : undefined,
          code: "code" in e ? String(e.code) : undefined,
        },
      }); 
    });
    
    if(c?.connectionState?.get() === "failed") { 
      setTimeout(() => {
        if(c?.connectionState?.get() === "failed") {
          delete this.mcpConnections[connection.id];
        }
      }, 5000); 
    }
  }


  async *streamConnections(): AsyncGenerator<serverConfig> {
    //@ts-ignore   
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
    // const iterator = this.streamConnections();
    // await iterator.next();
    return Array.from(this.store.entries()).map(([key, value]) => ({
      id: key,
      url: value.url,
      name: value.name,
      version: value.version,
      status:
        this.mcpConnections[key]?.connectionState?.get() ?? "disconnected",
      error: this.mcpConnections[key]?.error?.get() ?? undefined,
    }));
  }

  async addConnection({ id, url, name, version }: serverConfig) {
    this.store.set(id, {
      id,
      url,
      name,
      version,
    });

    return {
      id,
      url,
      name,
      version,
      status: this.mcpConnections[id]?.connectionState?.get() ?? "initializing",
    };
  }

  /**
   * Connect to and register an MCP server
   *
   * @param url
   * @param options
   */
  async connect({ id, url, name, version }: serverConfig, extra?: {auth?: AuthInfo}) {
    const auth = extra?.auth  || this.session.auth;
    if (!this.mcpConnections[id]) {
      console.log("new connection", id, url);
      this.mcpConnections[id] = new MCPClientConnection(new URL(url), {
        info: {
          name: name || id,
          version: version || "1.0.0",
        },
        client: {
          capabilities: {
          },
        },
        transport: () =>
          new StreamableHTTPClientTransport(new URL(url), {
            requestInit: auth?.token
              ? {
                  headers: {
                    Authorization: `Bearer ${auth.token}`,
                  },
                }
              : undefined,
            // sessionId: this.auth.extra?.sub? `${this.auth.extra.sub}-${this.id}` : undefined,
          }),
      });
      const stateSubscription  = this.mcpConnections[id].connectionState.subscribe((state) => {
        if(state === "ready") {
          this.connected.emit(id);
          stateSubscription.unsubscribe();
        }
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
    }

    await this.mcpConnections[id].init();
 
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
              const result = await this.callTool(
                {
                  name: tool.name,
                  arguments: args,
                },
                {
                  authInfo: this.session.auth,
                  sendRequest: async () => ({} as any),
                  sendNotification: async () => {},
                  signal: new AbortController().signal,
                  requestId: "",
                  sessionId: this.session.session,
                  _meta: {}
                }
              );
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
   * Helper method to create a fresh connection to a server and execute an operation
   */
  private async useServer<T>(
    serverId: string,
    authInfo: AuthInfo | undefined,
    sessionId: string | undefined,
    operation: (client: Client) => Promise<T>,
    notifications: {
      started?: (params: any) => void;
      connected?: (params: any) => void;
      completed?: (params: any) => void;
      disconnected?: (params: any) => void;
    } = {}
  ): Promise<T> {
    const serverConfig = this.store.get(serverId);
    if (!serverConfig) {
      throw new Error(`Server configuration not found for ID: ${serverId}`);
    }
    const { url } = serverConfig;

    const cacheKey = sessionId ? `${serverId}:${sessionId}` : serverId;
    const newClient = async () => {
        // Create new client and transport
          const transport = new StreamableHTTPClientTransport(new URL(url), {
            requestInit: authInfo?.token
              ? {
                  headers: {
                    Authorization: `Bearer ${authInfo.token}`,
                  }
                }
              : undefined,
          });

          const client = new Client({
            name: "mcp-client",
            version: "1.0.0",
          }); 
   
        await client.connect(transport);

        return {client, transport}; 
    }
    // Check if we have a cached client
    const cached = this.clientCache.get(cacheKey) || await newClient();
   
    this.clientCache.set(cacheKey, {
      client: cached.client,
      transport: cached.transport,
      lastUsed: Date.now(),
    }); 
      try {
        const result = await operation(cached.client); 
        if (notifications.completed) {
          notifications.completed({
            server: serverId,
            url: url,
            result,
            cached: true,
          });
        }

        return result;
      } catch (error: any) {
        // If operation fails, remove from cache and recreate
        console.log(`Cached client failed for ${cacheKey}, removing from cache`);
        this.clientCache.delete(cacheKey);
        try {
          await cached.client.close();
          await cached.transport.close();
        } catch (closeError) {
          console.error(`Error closing failed cached client:`, closeError);
        }
        if (notifications.disconnected) {
          notifications.disconnected({
            server: serverId,
            url: url,
            cached: true,
            error: {
              message: "message" in error ? error.message : error.toString(),
              stack: "stack" in error ? error.stack : undefined,
              code: "code" in error ? String(error.code) : undefined,
            }
          });
        }
        throw error;
      }
    }

  /**
   * Namespaced version of
   */
  async callTool(
    { name, ...params }: Zod.infer<typeof CallToolRequestSchema>["params"],
    {authInfo, sendRequest, sendNotification, signal, requestId, sessionId, _meta}: RequestHandlerExtra<CallToolRequest, any>,
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
      "store",
      Array.from(this.store.keys()),
      tool
    );

    if (!tool) {
      throw new Error(`Tool with name "${name}" does not exist.`);
    }

    sendNotification({
      method: "notifications/call-tool/started",
      params: {
        requestId,
        sessionId,
        authInfo,
        server: tool.server,
        name: tool.name,
        uri: tool.uri,
        url: this.store.get(tool.server)?.url,
        version: this.store.get(tool.server)?.version,
        ref: {
          type: "ref/tool",
          name: name,
        },
        arguments: params,
      },
    });

    console.log("Tool found", tool);

    return this.useServer(
      tool.server,
      authInfo,
      sessionId,
      async (client) => {
        return client.callTool(
          {
            ...params,
            name: tool.name,
          },
          resultSchema,
          options
        );
      },
      {
        connected: (params) => {
          sendNotification({
            method: "client/connected",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: tool.server,
              name: tool.name,
              uri: tool.uri,
              url: this.store.get(tool.server)?.url,
              version: this.store.get(tool.server)?.version,
              ref: {
                type: "ref/tool",
                name: name,
              },
            },
          });
        },
        completed: (params) => {
          sendNotification({
            method: "notifications/call-tool/completed",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: tool.server,
              name: tool.name,
              uri: tool.uri,
              url: this.store.get(tool.server)?.url,
              version: this.store.get(tool.server)?.version,
              result: params.result,
              ref: {
                type: "ref/tool",
                name: name,
              },
            },
          });
        },
        disconnected: (params) => {
          sendNotification({
            method: "client/disconnected",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: tool.server,
              name: tool.name,
              uri: tool.uri,
              url: this.store.get(tool.server)?.url,
              version: this.store.get(tool.server)?.version,
              ref: {
                type: "ref/tool",
                name: name,
              },
            },
          });
        },
      }
    );
  }

  async complete(
    { ref, ...params }: CompleteRequest["params"],
    {authInfo, sendRequest, sendNotification, signal, requestId, sessionId, _meta}: RequestHandlerExtra<CompleteRequest, any>,
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

    sendNotification({
      method: "notifications/complete/started",
      params: {
        requestId,
        sessionId,
        authInfo,
        server: source.server,
        name: source.name,
        uri: source.uri,
        url: this.store.get(source.server)?.url,
        version: this.store.get(source.server)?.version,
        ref: ref,
      },
    });

    return this.useServer(
      source.server,
      authInfo,
      sessionId,
      async (client) => {
        return client.complete(
          {
            ...params,
            ref: {
              ...ref,
              ...source,
            },
          },
          options
        );
      },
      {
        connected: (params) => {
          sendNotification({
            method: "client/connected",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: source.server,
              name: source.name,
              uri: source.uri,
              url: this.store.get(source.server)?.url,
              version: this.store.get(source.server)?.version,
              ref: ref,
            },
          });
        },
        completed: (params) => {
          sendNotification({
            method: "notifications/complete/completed",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: source.server,
              name: source.name,
              uri: source.uri,
              url: this.store.get(source.server)?.url,
              version: this.store.get(source.server)?.version,
              result: params.result,
              ref: ref,
            },
          });
        },
        disconnected: (params) => {
          sendNotification({
            method: "client/disconnected",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: source.server,
              name: source.name,
              uri: source.uri,
              url: this.store.get(source.server)?.url,
              version: this.store.get(source.server)?.version,
              ref: ref,
            },
          });
        },
      }
    );
  }

  /**
   * Namespaced version of readResource
   */
  async readResource(
    params: ReadResourceRequest["params"],
    {authInfo, sendRequest, sendNotification, signal, requestId, sessionId, _meta}: RequestHandlerExtra<ReadResourceRequest, any>,
    options?: RequestOptions
  ) {
    const source = await findSourceAsync(this.resources, params.uri);

    sendNotification({
      method: "notifications/read-resource/started",
      params: {
        requestId,
        sessionId,
        authInfo,
        server: source.server,
        name: source.name,
        uri: source.uri,
        url: this.store.get(source.server)?.url,
        version: this.store.get(source.server)?.version,
        ref: {
          type: "ref/resource",
          uri: params.uri,
        },
      },
    });

    return this.useServer(
      source.server,
      authInfo,
      sessionId,
      async (client) => {
        return client.readResource(
          {
            ...params,
            ...source,
          },
          options
        );
      },
      {
        connected: (params) => {
          sendNotification({
            method: "client/connected",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: source.server,
              name: source.name,
              uri: source.uri,
              url: this.store.get(source.server)?.url,
              version: this.store.get(source.server)?.version,
              ref: {
                type: "ref/resource",
                uri: params.uri,
              },
            },
          });
        },
        completed: (params) => {
          sendNotification({
            method: "notifications/read-resource/completed",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: source.server,
              name: source.name,
              uri: source.uri,
              url: this.store.get(source.server)?.url,
              version: this.store.get(source.server)?.version,
              result: params.result,
              ref: {
                type: "ref/resource",
                uri: params.uri,
              },
            },
          });
        },
        disconnected: (params) => {
          sendNotification({
            method: "client/disconnected",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: source.server,
              name: source.name,
              uri: source.uri,
              url: this.store.get(source.server)?.url,
              version: this.store.get(source.server)?.version,
              ref: {
                type: "ref/resource",
                uri: params.uri,
              },
            },
          });
        },
      }
    );
  }

  /**
   * Namespaced version of getPrompt
   */
  async getPrompt(
    params: GetPromptRequest["params"],
    {authInfo, sendRequest, sendNotification, signal, requestId, sessionId, _meta}: RequestHandlerExtra<GetPromptRequest, any>,
    options?: RequestOptions
  ) {
    const { server, name } = await findSourceAsync(this.prompts, params.name);

    sendNotification({
      method: "notifications/get-prompt/started",
      params: {
        requestId,
        sessionId,
        authInfo,
        server: server,
        name: name,
        uri: this.store.get(server)?.url,
        version: this.store.get(server)?.version,
        ref: {
          type: "ref/prompt",
          name: name,
        },
      },
    });

    return this.useServer(
      server,
      authInfo,
      sessionId,
      async (client) => {
        return client.getPrompt(
          {
            ...params,
            name,
          },
          options
        );
      },
      {
        connected: (params) => {
          sendNotification({
            method: "client/connected",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: server,
              name: name,
              uri: this.store.get(server)?.url,
              version: this.store.get(server)?.version,
              ref: {
                type: "ref/prompt",
                name: name,
              },
            },
          });
        },
        completed: (params) => {
          sendNotification({
            method: "notifications/get-prompt/completed",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: server,
              name: name,
              uri: this.store.get(server)?.url,
              version: this.store.get(server)?.version,
              result: params.result,
              ref: {
                type: "ref/prompt",
                name: name,
              },
            },
          });
        },
        disconnected: (params) => {
          sendNotification({
            method: "client/disconnected",
            params: {
              requestId,
              sessionId,
              authInfo,
              server: server,
              name: name,
              uri: this.store.get(server)?.url,
              version: this.store.get(server)?.version,
              ref: {
                type: "ref/prompt",
                name: name,
              },
            },
          });
        },
      }
    );
  }

  /**
   * Clean up expired clients from the cache
   */
  private async cleanupExpiredClients() {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cached] of this.clientCache.entries()) {
      if (now - cached.lastUsed > this.CACHE_TTL) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      const cached = this.clientCache.get(key);
      if (cached) {
        try {
          await cached.client.close();
          await cached.transport.close();
        } catch (error) {
          console.error(`Error closing cached client ${key}:`, error);
        }
        this.clientCache.delete(key);
        console.log(`Cleaned up expired cached client: ${key}`);
      }
    }
  }

  /**
   * Manually clear a cached client for a specific server and session
   */
  async clearCachedClient(serverId: string, sessionId?: string) {
    const cacheKey = sessionId ? `${serverId}:${sessionId}` : serverId;
    const cached = this.clientCache.get(cacheKey);
    
    if (cached) {
      try {
        await cached.client.close();
        await cached.transport.close();
      } catch (error) {
        console.error(`Error closing cached client ${cacheKey}:`, error);
      }
      this.clientCache.delete(cacheKey);
      console.log(`Manually cleared cached client: ${cacheKey}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all cached clients for a specific session
   */
  async clearSessionCache(sessionId: string) {
    const keysToRemove: string[] = [];
    
    for (const [key, cached] of this.clientCache.entries()) {
      if (key.includes(`:${sessionId}`)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const cached = this.clientCache.get(key);
      if (cached) {
        try {
          await cached.client.close();
          await cached.transport.close();
        } catch (error) {
          console.error(`Error closing cached client ${key}:`, error);
        }
        this.clientCache.delete(key);
      }
    }

    console.log(`Cleared ${keysToRemove.length} cached clients for session: ${sessionId}`);
    return keysToRemove.length;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    const stats = {
      totalCached: this.clientCache.size,
      expired: 0,
      active: 0,
      details: [] as Array<{
        key: string;
        lastUsed: number;
        age: number;
        expired: boolean;
      }>
    };

    for (const [key, cached] of this.clientCache.entries()) {
      const age = now - cached.lastUsed;
      const expired = age > this.CACHE_TTL;
      
      if (expired) {
        stats.expired++;
      } else {
        stats.active++;
      }

      stats.details.push({
        key,
        lastUsed: cached.lastUsed,
        age,
        expired
      });
    }

    return stats;
  }
}

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