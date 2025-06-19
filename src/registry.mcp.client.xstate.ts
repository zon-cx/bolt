import {
  enqueueActions,
  setup,
  assign,
  ActorLogic,
  Values,
  emit,
  spawnChild,
  fromPromise,
  fromCallback,
  ActorRefFromLogic,
} from "xstate";
import {
  auth,
  OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import type {
  RequestHandlerExtra,
  RequestOptions,
} from "@modelcontextprotocol/sdk/shared/protocol.js";
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
import { jsonSchema, type ToolSet } from "ai";
import * as Y from "yjs";
import mcpClientMachine, { MCPClient } from "./mcp.client.xstate.js";
import { yMapIterate } from "@cxai/stream";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { env, version } from "node:process";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListConnectionsResultSchema } from "./registry.mcp.server";
import { z } from "zod";
import EventEmitter from "node:events";
import { createActor } from "xstate";

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

export type ServerConfig = {
  id: string;
  url: string;
  name?: string;
  version?: string;
  status?: string;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
};
const clientManagerSetup = setup({
  types: {} as {
    context: ClientManager.Context;
    events: ClientManager.Event;
    input: ClientManager.Input;
    emitted: ClientManager.EmittedEvent;
    actors: {
      mcpClient: typeof mcpClientMachine;
      connectionManager: ActorLogic<any, any, any, any, any>;
      registryUpdater: ActorLogic<any, any, any, any, any>;
      cacheCleaner: ActorLogic<any, any, any, any, any>;
    };
  },
  actors: {
    mcpClient: mcpClientMachine,
    connectionManager: fromCallback(
      ({
        sendBack,
        input,
      }: {
        sendBack: (event: any) => void;
        input: ClientManager.ConnectionManagerInput;
      }) => {
        const { session, store } = input;

        // Observe store changes and manage connections
        const observer = (event: Y.YMapEvent<ServerConfig>) => {
          for (const [key] of event.changes.keys.entries()) {
            const config = store.get(key);
            if (config && !config.status) {
              sendBack({
                type: "connect",
                ...config,
                id: key,
              });
            }
          }
        };

        store.observe(observer);

        // Return cleanup function
        return () => {
          store.unobserve(observer);
        };
      }
    ),
    registryUpdater: fromCallback<MCPClient.Updates.ResourceUpdate,ClientManager.RegistryUpdaterInput,MCPClient.Event>(
      ({
        sendBack,
        input,
        self
      } ) => {
        const { registry } = input;

        const snapshot = registry.getSnapshot(); 
        if(snapshot.context.client ){
          // Initial update
          // updateRegistry({ resources: snapshot.context.resources, client: snapshot.context.client });
          for (const [id, resource] of Object.entries(snapshot.context.resourceData)) {
            const {contents} = resource;
            const {mcpActors} = self._parent?.getSnapshot()?.context; 
            if ( !mcpActors[id]) {
              sendBack({
                type: "connect", 
                id,
                ...contents[0]
              });
            }
          }
        }

        registry.on("@updates.resources.data", (e) => {
           const { name, contents } = e as MCPClient.Updates.ResourceDataUpdate;
           const {mcpActors} = self._parent?.getSnapshot()?.context; 
           if ( !mcpActors[name]) {
            sendBack({
              type: "connect", 
               ...contents[0]
            });
          }
        }); 
      }
       
      
    
    ),
    cacheCleaner: fromCallback(
      ({
        sendBack,
        input,
      }: {
        sendBack: (event: any) => void;
        input: ClientManager.CacheCleanerInput;
      }) => {
        const { clientCache, CACHE_TTL } = input;

        const cleanup = () => {
          const now = Date.now();
          const expiredKeys: string[] = [];

          for (const [key, cached] of clientCache.entries()) {
            if (now - cached.lastUsed > CACHE_TTL) {
              expiredKeys.push(key);
            }
          }

          if (expiredKeys.length > 0) {
            sendBack({
              type: "cleanup",
              expiredKeys,
            });
          }
        };

        // Run cleanup every minute
        const interval = setInterval(cleanup, 60 * 1000);

        return () => {
          clearInterval(interval);
        };
      }
    ),
  },
  actions: {
    emit: emit((_, e: ClientManager.EmittedEvent) => e),
  },
});

const clientManagerMachine = clientManagerSetup.createMachine({
  id: "@manager/client",
  initial: "init",
  context: ({ input }) => ({
    session: input.session,
    store: input.store,
    mcpActors: {} as Record<string, any>,
    tools: [] as NamespacedData["tools"],
    prompts: [] as NamespacedData["prompts"],
    resources: [] as NamespacedData["resources"],
    resourceTemplates: [] as NamespacedData["resourceTemplates"],
    clientCache: new Map<
      string,
      {
        client: Client;
        transport: StreamableHTTPClientTransport;
        lastUsed: number;
      }
    >(),
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    connected: new EventEmitter(),
    pendingConnection: undefined,
  }),
  states: {
    init: {
        entry:  enqueueActions(({ context, enqueue ,self}) => {
            const id= self.id;
            const url= new URL(`${env.MCP_REGISTRY_URL!}/${id}`);
            enqueue.assign({
                mcpActors: ({ context: { mcpActors, session }, spawn }) => ({
                  ["@registry"]: spawn("mcpClient", {
                    systemId: `@registry:${session?.id}`,
                    syncSnapshot: true,
                    input: {
                      url: url,
                      options: {
                        info: {
                          name: id,
                          version: version || "1.0.0",
                        },
                        auth: context.session.auth,
                        session: context.session.session,
                      },
                    },
                  }),
                  ...mcpActors,
                })
            })
        }),
        invoke: {
          src:  fromPromise(async ({ input }) => {
            const { registry } = input;
            return new Promise((resolve, reject) => {
            const snapshot = registry.getSnapshot();
            if(snapshot.context.client && snapshot.matches("ready")){
              return snapshot.context;
            }
                // Subscribe to resource changes for updates
            const subscription = registry.subscribe((state) => {
              if(state.matches("ready") ){
                resolve(state.context);
              }
            });   
            return () => {
              subscription.unsubscribe();
            };
          });
          }),
          input: ({ context }) => ({
            registry: context.mcpActors["@registry"],
          }),
          onDone: {
            target: "running",
          },
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) => event.error as Error,
            }),
          },
        },
     
    
    },

    running: {
      initial: "managing",
      on: {
        "@updates.tools": {
          actions: [
            assign({
              tools: ({ context, event }) =>
                getNamespacedData(context.mcpActors, "tools"),
            }),
          ],
        },
      },
      states: {
        managing: {
          invoke: [
            {
              src: "connectionManager",
              input: ({ context }) => ({
                session: context.session,
                store: context.store,
              }),
            },
            {
              src: "registryUpdater",
              input: ({ context: { mcpActors } }) => ({
                registry: mcpActors["@registry"],
                actors: mcpActors,
              }),
            },
            {
              src: "cacheCleaner",
              input: ({ context }) => ({
                clientCache: context.clientCache,
                CACHE_TTL: context.CACHE_TTL,
              }),
            },
          ],
          on: {
            cleanup: {
              actions: [
                assign({
                  clientCache: ({ context, event }) => {
                    const cleanupEvent = event as {
                      type: "cleanup";
                      expiredKeys: string[];
                    };
                    for (const key of cleanupEvent.expiredKeys) {
                      const cached = context.clientCache.get(key);
                      if (cached) {
                        try {
                          cached.client.close();
                          cached.transport.close();
                        } catch (error) {
                          console.error(
                            `Error closing cached client ${key}:`,
                            error
                          );
                        }
                        context.clientCache.delete(key);
                      }
                    }
                    return context.clientCache;
                  },
                })
              ],
            },

            "recalculate-tools": {
              actions: [
                assign({
                  tools: ({ context }) =>
                    getNamespacedData(context.mcpActors, "tools"),
                }),
              ],
            },

            disconnect: {
              target: "disconnecting",
            },
            connect: {
              target: "connecting",
              actions: assign({
                pendingConnection: ({ event }) => event,
              }),
            },
          },
        },
        connecting: {
          entry: enqueueActions(({ context, enqueue }) => {
            if (context.pendingConnection) {
              const { url, name, version, id } = context.pendingConnection;
              enqueue.emit({
                type: `@connection.connecting.${id}`,
                timestamp: Date.now(),
                url,
                name,
                version,
                id,
                session: context.session,
              });
              if(!context.mcpActors[id]){
                enqueue.assign({
                  mcpActors: ({ context: { mcpActors, session }, spawn }) => ({
                    [id]: spawn("mcpClient", {
                      systemId: `${id}:${session?.id}`,
                      syncSnapshot: true,
                      input: {
                        url: new URL(url),
                        options: {
                          info: {
                            name: name || id,
                            version: version || "1.0.0",
                          },
                          auth: context.session.auth,
                          session: context.session.session,
                        },
                      },
                    }),
                    ...mcpActors,
                  }),
                });
                
                // After spawning, subscribe to tool updates
                enqueue(({ context: { mcpActors }, self }) => {
                  const actor = mcpActors[id];
                  if (actor) {
                    actor.subscribe((state) => {
                      // When child's tools change, update manager's aggregated tools
                      if (state.context.tools && state.matches("ready")) {
                        self.send({ type: "recalculate-tools" });
                      }
                    });
                  }
                });
              }
            }
          }),
          always: {
            target: "managing",
            actions: [
              assign({
                pendingConnection: undefined,
              }),
            ]
          }
        },
      
        disconnecting: {
          invoke: {
            src: fromPromise(
              async ({ input }: { input: { actors: Record<string, any> } }) => {
                await Promise.all(
                  Object.values(input.actors).map(async (actor) => {
                    actor.send({ type: "cleanup" });
                  })
                );
              }
            ),
            input: ({ context }) => ({ actors: context.mcpActors }),
            onDone: {
              target: "done",
            },
            onError: {
              target: "done",
            },
          },
        },
        done: {
          type: "final",
          output: ({ context }) => context,
        },
      },
    },
    error: {
      type: "final",
      output: ({ context }) => context,
      on: {
        retry: {
          target: "init",
        },
      },
    },
  },
});
// Helper functions
export function getNamespacedData<T extends keyof NamespacedData>(
  mcpActors: Record<string, any>,
  type: T
): NamespacedData[T] {
  const sets = Object.entries(mcpActors).map(([name, actor]) => {
    const snapshot = actor.getSnapshot();
    return { name, data: snapshot.context[type] };
  });

  const namespacedData = sets.flatMap(({ name: server, data }) => {
    if (!data || !Array.isArray(data)) {
      console.warn(`Data for ${type} in client ${server} is not an array`);
      return [];
    }

    try {
      return data.map((resource: any) => {
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
      });
    } catch (error) {
      console.error(`Error getting ${type} data from client ${server}:`, error);
      return [];
    }
  });

  return namespacedData as NamespacedData[T];
}

export default clientManagerMachine;

type Optional<T> = {
  [K in keyof T]?: T[K];
};

export namespace ClientManager {
  export type ConnectionManagerInput = {
    session: {
      store: Y.Map<ServerConfig>;
      auth: AuthInfo;
      session?: string;
      id?: string;
      name?: string;
      version?: string;
    };
    store: Y.Map<ServerConfig>;
  };

  export type RegistryUpdaterInput = {
    registry: ActorRefFromLogic<typeof mcpClientMachine>
    actors: Record<string, ActorRefFromLogic<typeof mcpClientMachine>>
  };

  export type CacheCleanerInput = {
    clientCache: Map<
      string,
      {
        client: Client;
        transport: StreamableHTTPClientTransport;
        lastUsed: number;
      }
    >;
    CACHE_TTL: number;
  };

  export type ConnectInput = {
    config: ServerConfig;
    session: {
      store: Y.Map<ServerConfig>;
      auth: AuthInfo;
      session?: string;
      id?: string;
      name?: string;
      version?: string;
    };
  };

  export type Input = {
    session: {
      store: Y.Map<ServerConfig>;
      auth: AuthInfo;
      session?: string;
      id?: string;
      name?: string;
      version?: string;
    };
    store: Y.Map<ServerConfig>;
  };

  export type Context = {
    session: {
      store: Y.Map<ServerConfig>;
      auth: AuthInfo;
      session?: string;
      id?: string;
      name?: string;
      version?: string;
    };
    error?: Error;
    store: Y.Map<ServerConfig>;
    mcpActors: Record<string, any>;
    tools: NamespacedData["tools"];
    prompts: NamespacedData["prompts"];
    resources: NamespacedData["resources"];
    resourceTemplates: NamespacedData["resourceTemplates"];
    clientCache: Map<
      string,
      {
        client: Client;
        transport: StreamableHTTPClientTransport;
        lastUsed: number;
      }
    >;
    CACHE_TTL: number;
    connected: EventEmitter;
    pendingConnection?: ServerConfig;
  };

  export type EmittedEvent = MCPClient.Event | Connection.Event;

  export type Event =
    | {
        type: "cleanup";
        expiredKeys: string[];
      }
    | ({
        type: "connect";
        session: Context["session"];
      } & ServerConfig)
    | ({
        type: "disconnect";
        id: string;
      } & ServerConfig)
    | {
        type: "recalculate-tools";
      }
    | MCPClient.Event;
}

export namespace Connection {
  export type Event =
    | {
        type: "@connection.new";
        connection: MCPClient.Context;
      }
    | ({
        type: `@connection.connecting.${string}`;
        timestamp: number;
        session: ClientManager.Context["session"];
      } & ServerConfig)
    | ({
        type: `@connection.connected.${string}`;
        timestamp: number;
        session: ClientManager.Context["session"];
      } & ServerConfig)
    | ({
        type: `@connection.failed.${string}`;
        timestamp: number;
      } & ServerConfig)
    | ({
        type: `@connection.disconnected.${string}`;
        timestamp: number;
      } & ServerConfig);
}
