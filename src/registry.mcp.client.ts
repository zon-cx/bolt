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

import * as Y from "yjs";
import mcpClientMachine, { MCPClient } from "./mcp.client.js";
import { env, version } from "node:process";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { NamespacedDataStore } from "./registry.mcp.client.namespace.js";
 

export type ServerConfig = {
  id: string;
  url: string;
  name?: string;
  version?: string;
  type?: "streamable" | "sse";
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
        const { auth, sessionId, store } = input;

        // Observe store changes and manage connections
        const observer = (event: Y.YMapEvent<ServerConfig>) => {
          for (const [key] of event.changes.keys.entries()) {
            const config = store.get(key);
            if (config && !config.status) {
              sendBack({
                auth,
                sessionId,
                ...config,
                id: key,
                transportType: config.type || "streamable",
                type: "connect"

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
    registryUpdater: fromCallback<MCPClient.Updates.ResourceUpdate, ClientManager.RegistryUpdaterInput, MCPClient.Event>(
      ({
        sendBack,
        input,
        self
      }) => {
        const { registry, store, actors } = input;

        const snapshot = registry.getSnapshot(); 
        if(snapshot.context.client ){
          // Initial update - register existing resources
          for (const [id, resource] of Object.entries(snapshot.context.resourceData)) {
            const {contents} = resource;
            const mcpActors = actors(); 
            if (!mcpActors[id]) {
              // Add to store instead of sending connect event
              store.set(id, {
                id,
                ...contents[0]
              });
            }
          }
        }

        registry.on("@updates.resources.data", (e) => {
           const { name, contents } = e as MCPClient.Updates.ResourceDataUpdate;
           const mcpActors = actors(); 
           if (!mcpActors[name]) {
            store.set(name, {
              id: name,
              url: contents[0].url,
              name: contents[0].name,
              version: contents[0].version,
              type: contents[0].type || "streamable",
            });
          }
        }); 
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
    auth: input.auth,
    sessionId: input.sessionId,
    store: input.store,
    dataStore: input.dataStore,
    mcpActors: {} as Record<string, any>,
  }),
  states: {
    init: {
        entry: enqueueActions(({ context, enqueue, self }) => {
            const id = self.id;
            const registryUrl = env.MCP_REGISTRY_URL || "https://registry.cfapps.eu12.hana.ondemand.com/mcp";
            const url = new URL(`${registryUrl}/${id}`);
            
            enqueue.assign({
                mcpActors: ({ context: { mcpActors, sessionId }, spawn }) => {
                  const registryActor = spawn("mcpClient", {
                    systemId: `@registry:${sessionId}`,
                    syncSnapshot: true,
                    input: {
                      url: url,
                      options: {
                        info: {
                          name: id,
                          version: version || "1.0.0",
                        },
                        auth: context.auth,
                        session: context.sessionId,
                        transportType: "streamable",
                      },
                    },
                  });
                  
                  return {
                    ["@registry"]: registryActor,
                    ...mcpActors,
                  };
                }
            });
            
            // Register with data store after assignment
            enqueue(({ context }) => {
              const registryActor = context.mcpActors["@registry"];
              if (registryActor) {
                context.dataStore.registerClient("@registry", registryActor);
              }
            });
        }),
        invoke: {
          src: fromPromise(async ({ input }) => {
            const { registry } = input;
            return new Promise((resolve, reject) => {
              const snapshot = registry.getSnapshot();
              if(snapshot.context.client && snapshot.matches("ready")){
                return resolve(snapshot.context);
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
      invoke: [
        {
          src: "connectionManager",
          input: ({ context }) => ({
            auth: context.auth,
            sessionId: context.sessionId,
            store: context.store,
          }),
        },
        {
          src: "registryUpdater",
          input: ({ context: { mcpActors, store }, self }) => ({
            registry: mcpActors["@registry"],
            actors: () => self.getSnapshot().context.mcpActors,
            store: store,
          }),
        },
      ],
      on: {
        // Handle new connections
        connect: {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const { url, name, version, id, type , transportType} = event as any;
            
            // Emit connecting event
            enqueue.emit({
              type: `@connection.connecting.${id}`,
              timestamp: Date.now(),
              url,
              name,
              version,
              id,
              transportType,
              auth: context.auth,
              sessionId: context.sessionId,
            } as any);

            // Spawn new MCP client if it doesn't exist
            if (!context.mcpActors[id]) {
              enqueue.assign({
                mcpActors: ({ context: { mcpActors, sessionId }, spawn }) => {
                  const newActor = spawn("mcpClient", {
                    systemId: `${id}:${sessionId}`,
                    syncSnapshot: true,
                    input: {
                      url: new URL(url),
                      options: {
                        info: {
                          name: name || id,
                          version: version || "1.0.0",
                        },
                        auth: context.auth,
                        session: context.sessionId,
                        transportType: transportType || "streamable",
                      },
                    },
                  });

                  return {
                    ...mcpActors,
                    [id]: newActor,
                  };
                },
              });
              
              // Register with data store after assignment
              enqueue(({ context }) => {
                const newActor = context.mcpActors[id];
                if (newActor) {
                  context.dataStore.registerClient(id, newActor);
                }
              });
            }
          }),
        },

        // Handle disconnections
        disconnect: {
          actions: ({ context, event }) => {
            const actor = context.mcpActors[event.id];
            if (actor) {
              actor.send({ type: "cleanup" });
              context.dataStore.unregisterClient(event.id);
            }
          },
        },

        // Disconnect all and transition to final state
        "disconnect-all": {
          target: "disconnecting",
        },
      },
    },

    disconnecting: {
      invoke: {
        src: fromPromise(
          async ({ input }: { input: { actors: Record<string, any>; dataStore: NamespacedDataStore } }) => {
            // Cleanup all actors and unregister from data store
            await Promise.all(
              Object.entries(input.actors).map(async ([id, actor]) => {
                actor.send({ type: "cleanup" });
                input.dataStore.unregisterClient(id);
              })
            );
          }
        ),
        input: ({ context }) => ({ 
          actors: context.mcpActors,
          dataStore: context.dataStore,
        }),
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

export default clientManagerMachine;

export namespace ClientManager {
  export type ConnectionManagerInput = {
    auth: AuthInfo;
    sessionId?: string;
    store: Y.Map<ServerConfig>;
  };

  export type RegistryUpdaterInput = {
    store: Y.Map<ServerConfig>;
    registry: ActorRefFromLogic<typeof mcpClientMachine>
    actors: ()=> Record<string, ActorRefFromLogic<typeof mcpClientMachine>>
  };

  export type Input = {
    auth: AuthInfo;
    sessionId?: string;
    store: Y.Map<ServerConfig>;
    dataStore: NamespacedDataStore;
  };

  export type Context = {
    auth: AuthInfo;
    sessionId?: string;
    error?: Error;
    store: Y.Map<ServerConfig>;
    dataStore: NamespacedDataStore;
    mcpActors: Record<string, any>;
  };

  export type EmittedEvent = MCPClient.Event | Connection.Event;

  export type Event =
    | {
        type: "connect";
        transport: string;
      } & Omit<ServerConfig, "type">
    | {
        type: "disconnect";
        id: string;
      } & ServerConfig
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
        auth: AuthInfo;
        sessionId?: string;
      } & ServerConfig)
    | ({
        type: `@connection.connected.${string}`;
        timestamp: number;
        auth: AuthInfo;
        sessionId?: string;
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

 