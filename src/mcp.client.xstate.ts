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
  sendTo,
  raise,
} from "xstate";
import {
  ToolListChangedNotificationSchema,
  type ClientCapabilities,
  type Resource,
  type Tool,
  type Prompt,
  ResourceListChangedNotificationSchema,
  PromptListChangedNotificationSchema,
  type ListToolsResult,
  type ListResourcesResult,
  type ListPromptsResult,
  type ServerCapabilities,
  type ResourceTemplate,
  type ListResourceTemplatesResult,
  type Notification,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export type TransportFactory = () =>
  | StreamableHTTPClientTransport
  | SSEClientTransport;

  class MCPSession {
      private clientCache: Map<string, { client: Client; transport: StreamableHTTPClientTransport; lastUsed: number; status: "connecting" | "connected" | "disconnected" }> = new Map();
  
    constructor(
      
    ) {}
  
   /**
     * Helper method to create a fresh connection to a server and execute an operation
     */
   public async useServer<T>(
      {
      url,

      auth,
      session
      }: {
      url: URL,
      auth: AuthInfo | undefined,
      session: string | undefined,
      },  
      operation: (client: Client) => Promise<T>,
      notifications: {
        started?: (params: any) => void;
        connected?: (params: any) => void;
        completed?: (params: any) => void;
        disconnected?: (params: any) => void;
      } = {}
    ): Promise<{client: Client, transport: StreamableHTTPClientTransport, result: T}> {
       const cacheKey = session ? `${url.href}:${session}` : url.href;
      const newClient = async () => {
            console.log("creating new client", url.href);
          // Create new client and transport
            const transport = new StreamableHTTPClientTransport(new URL(url), {
              requestInit: auth?.token
                ? {
                    headers: {
                      Authorization: `Bearer ${auth.token}`,
                    }
                  }
                : undefined,
            });
  
            const client = new Client({
              name: "mcp-client",
              version: "1.0.0",
            }); 
            this.clientCache.set(cacheKey, {
              client,
              transport,
              lastUsed: Date.now(),
              status: "connecting",
            });
          try {
            console.log("Attempting to connect client", url.href);
            await Promise.race([
              client.connect(transport),
              new Promise((_, reject) => {
                setTimeout(() => {
                  reject(new Error("Connection timeout"));
                }, 10000);
              })
            ]);
            console.log("Client connected, attempting ping", url.href);
            await Promise.race([
              client.ping(),
              new Promise((_, reject) => {
                setTimeout(() => {
                  reject(new Error("Ping timeout"));
                }, 5000);
              })
            ]);
            console.log("Client ping successful", url.href);

            this.clientCache.set(cacheKey, {
                  client: client,
                  transport: transport,
              lastUsed: Date.now(),
              status: "connected"
            }); 
            return  this.clientCache.get(cacheKey)!;
          } catch (error) {
            console.error("Failed to initialize client:", error);
            this.clientCache.delete(cacheKey);
            try {
              await transport.close();
            } catch (closeError) {
              console.error("Error closing transport:", closeError);
            }
            throw error;
          }
      }
      // Check if we have a cached client
      const cached = this.clientCache.get(cacheKey) || await newClient();
      if(cached.status === "connecting"){
         console.log("Waiting for client to connect...", url.href);
         let waitTime = 0;
         while(this.clientCache.get(cacheKey)?.status === "connecting" && waitTime < 15000) {
           await new Promise((resolve) => setTimeout(resolve, 500));
           waitTime += 500;
         }
         const currentStatus = this.clientCache.get(cacheKey)?.status;
         if(currentStatus === "connecting"){
            console.error("Client still connecting after timeout", url.href);
            this.clientCache.delete(cacheKey);
            throw new Error("Client connection timeout");
         }
         if(currentStatus === "disconnected"){
            console.error("Client disconnected while waiting", url.href);
            throw new Error("Client disconnected");
         }
      }
      if(cached.status === "disconnected"){
        console.error("Client is disconnected", url.href);
        this.clientCache.delete(cacheKey);
        throw new Error("Client is disconnected");
      }
      
        try {
          let timeoutId: NodeJS.Timeout | undefined;
          const result = await Promise.race([
            operation(cached.client).catch((error:any)=>{
              console.error("operation failed", error);
              throw error;
            }),
            new Promise<T>((_resolve, reject) => {
              timeoutId = setTimeout(() => {
                console.log("useServer.timeout");
                reject(new Error("Operation timed out"));
              }, 3000);
            })
          ]);
          if(timeoutId) clearTimeout(timeoutId);
          console.log("completed", result);
        //   if (notifications.completed) {
        //     notifications.completed({
        //       server: url,
        //       url: url,
        //       result,
        //       cached: true,
        //     });
        //   }
  
          return {
            client: cached.client,
            transport: cached.transport,
            result,
          };
        } catch (error: any) {
            console.error("error", error);
          // If operation fails, remove from cache and recreate
          console.log(`Cached client failed for ${cacheKey}, removing from cache`);
          this.clientCache.delete(cacheKey);
          try {
            await cached.client.close();
            await cached.transport.close();
          } catch (closeError) {
            console.error(`Error closing failed cached client:`, closeError);
          }
        //   if (notifications.disconnected) {
        //     notifications.disconnected({
        //       server: url,
        //       url: url,
        //       cached: true,
        //       error: {
        //         message: "message" in error ? error.message : error.toString(),
        //         stack: "stack" in error ? error.stack : undefined,
        //         code: "code" in error ? String(error.code) : undefined,
        //       }
        //     });
        //   }
          throw error;
        }
      }
  }
  const mcpSessions =new MCPSession();


  const mcpClientSetup = setup({
    types: {} as {
      context: MCPClient.Context;
      events: MCPClient.Event;
      input: Optional<MCPClient.Input>;
      actors: {
        connection: ActorLogic<any, any, any, any, any>;
        discovery: ActorLogic<any, any, any, any, any>;
        notificationHandler: ActorLogic<any, any, any, any, any>;
        resourceDataHandler: ActorLogic<any, any, any, any, any>;
      };
    },
    actors: {
      connection: fromPromise(
        async ({ input }: { input: MCPClient.ConnectionInput }) => {
          const { url, options } = input;
          const {
            info,
            client: clientOptions,
            transport: transportFactory,
            auth: auth,
            session: session,
            ...transportOptions
          } = options;
          try  {
             console.log("connecting to", url.toString(), "with options", options);
           const {
            client,
            transport,
            result:serverCapabilities
           } = await mcpSessions.useServer({
            url: url,
            auth: auth,
            session: session,
           }, async(client)=>{
            return await client.getServerCapabilities();
          },{
            started: ()=>{
              console.log("started connecting to", url.toString());
            },
            connected: ()=>{
              console.log("connected to", url.toString());
            },
          });
          return {
            client,
            transport,
            serverCapabilities,
          };
          } catch (error: any) {
            console.error("error connecting to", url.toString(), error);
            if (error instanceof UnauthorizedError) {
              throw new Error("Authentication required");
            }
            throw error;
          }
        },
      ),
      discovery: fromPromise(
        async ({ input }: { input: MCPClient.DiscoveryInput }) => {
          const { client, serverCapabilities } = input;

          const [instructions, tools, resources, prompts, resourceTemplates] =
            await Promise.all([
              client.getInstructions(),
              fetchTools(client),
              fetchResources(client),
              fetchPrompts(client),
              fetchResourceTemplates(client),
            ]);

          return {
            instructions,
            tools,
            resources,
            prompts,
            resourceTemplates,
          };
        }
      ),
      resourceDataHandler: fromCallback<MCPClient.Event,MCPClient.ResourceDataHandlerInput,MCPClient.Updates.ResourceDataUpdate>(({
        input,
        receive,
        sendBack
      })=>{
        const { auth, session, url } = input;
  
        
        receive(async (event)=>{
            if(event.type === "read-resource"){
                const { uri, name, mimeType } = event;
                try{
                    const {result:{contents}} = await mcpSessions.useServer({
                        url: new URL(url), 
                        auth: auth,
                        session: session,
                    }, 
                    async(client)=>{
                        try{
                        console.log("reading resource", uri);
                        let timeoutId: NodeJS.Timeout | undefined;
                        const result = await Promise.race([
                          client.readResource({ uri }),
                          new Promise((_, reject) => {
                            timeoutId = setTimeout(() => {
                              console.log("Resource read timeout for", uri);
                              reject(new Error("Resource read timeout"));
                            }, 5000);
                          })
                        ]) as { contents: any[] };
                        if(timeoutId) clearTimeout(timeoutId);
                        console.log("result", result);
                        return result;
                        }
                        catch(error:any){
                            console.error("error reading resource: ",error);
                            throw error;
                        }
                    },{
                    started: ()=>{
                       console.log("started reading resource",url, uri);
                    },
                    connected: ()=>{
                        console.log("connected to", uri);
                    },
                    completed: ()=>{
                        console.log("completed reading resource", url, uri);
                    },
                    disconnected: ()=>{
                        console.log("disconnected from", uri);
                    }
                })
                if(mimeType==="application/json"){
                    sendBack({
                      type: "@updates.resources.data",
                      name: name,
                      uri: uri,
                      mimeType:"application/json",
                      contents: contents.map((content)=>content.text as string).filter(Boolean).map(e=>JSON.parse(e)),
                    });
                }
                else if(mimeType==="text/plain"){
                  sendBack({
                    type: "@updates.resources.data",
                    name: name,
                    uri: uri,
                    mimeType:"text/plain",
                    contents: contents.map((content)=>content.text),
                  });
                }
                else{
                  sendBack({
                    type: "@updates.resources.data",
                    name: name,
                    uri: uri,
                    mimeType:mimeType,
                    contents: contents,
                  });
                }
              }
              catch(error:any){
                console.error("error reading resource: ",error);
                sendBack({
                  type: "@mcp.error",
                  message: "message" in error ? error.message : "Unknown error",
                  stack: "stack" in error ? error.stack : "",
                  code: "code" in error ? error.code : -1,
                 });
              }
            }
          })
        }
      ),
        
      notificationHandler: fromCallback(
        ({
          sendBack,
          input,
        }: {
          sendBack: (event: MCPClient.Updates.Event) => void;
          input: MCPClient.NotificationHandlerInput;
        }) => {
          const { client, serverCapabilities } = input;
          const { resources, prompts, resourceTemplates, tools } = input;
          console.log("first init", "\nresources:", resources.map(r=>r.name), "\nprompts:", prompts.map(p=>p.name), "\nresourceTemplates:", resourceTemplates.map(r=>r.name), "\ntools:", tools.map(t=>t.name));
            tools.length && sendBack({
              type: "@updates.tools",
              tools,
            });
            resources.length && sendBack({
              type: "@updates.resources",
              resources,
            });
            prompts.length && sendBack({
              type: "@updates.prompts",
              prompts,
            });
            resourceTemplates.length && sendBack({
              type: "@updates.resourceTemplates",
              resourceTemplates,
            });
           
          // Register notification handlers that send events back to parent
          if (serverCapabilities?.tools?.listChanged !== false) {
            client.setNotificationHandler(
              ToolListChangedNotificationSchema,
              async (_notification) => {
                const tools = await fetchTools(client);
                sendBack({
                  type: "@updates.tools",
                  tools,
                });
              }
            );
          }

          if (serverCapabilities?.resources?.listChanged !== false) {
            client.setNotificationHandler(
              ResourceListChangedNotificationSchema,
              async (_notification) => {
                const resources = await fetchResources(client);
                sendBack({
                  type: "@updates.resources",
                  resources,
                });
                const resourceTemplates = await fetchResourceTemplates(client);
                sendBack({
                  type: "@updates.resourceTemplates",
                  resourceTemplates,    
                });
              }
            );
          } 
          if (serverCapabilities?.prompts?.listChanged !== false) {
            client.setNotificationHandler(
              PromptListChangedNotificationSchema,
              async (_notification) => {
                const prompts = await fetchPrompts(client);
                sendBack({
                  type: "@updates.prompts",
                  prompts,
                });
              }
            );
          }

      
        }
      ),
    },
    actions: {
      emit: emit((_, e: MCPClient.Event) => e),
    },
  });

  const mcpClientMachine = mcpClientSetup.createMachine({
    id: "@mcp/client",
    initial: "connecting",
    context: ({ input }) =>  ({
      url: input.url!,
      options: input.options!,
      instructions: undefined as string | undefined,
      tools: [] as Tool[],
      prompts: [] as Prompt[],
      resourceData: {} as Record<string, MCPClient.ResourceData>,
      resources: [] as Resource[],
      resourceTemplates: [] as ResourceTemplate[],
      serverCapabilities: undefined as ServerCapabilities | undefined,
      error: undefined as MCPClient.Error | undefined,
      client: undefined as Client | undefined,
      transport: undefined as ReturnType<TransportFactory> | undefined,
      retries: 0,
    }), 
    states: {
      connecting: {
        entry: [
          ({ context }) => {
            // Clean up any existing transport
            if (context.transport) {
              try {
                context.transport.close();
              } catch (e) {
                console.warn("Error closing transport:", e);
              }
            }
          }
        ],
        invoke: {
          src: "connection",
          input: ({ context }) => ({
            url: context.url,
            options: context.options,
          }),
          onDone: {
            target: "discovering",
            actions: assign({
              client: ({ event }) => event.output.client,
              transport: ({ event }) => event.output.transport,
              serverCapabilities: ({ event }) => event.output.serverCapabilities,
            }),
          },
          onError: {
            target: "failed",
            actions: [
              assign({
                error: ({ event }) => ({
                  message: (event as any).error?.message || "Unknown error",
                  stack: (event as any).error?.stack || "",
                  code: (event as any).error?.code || -1,
                }),
              })
            ],
          },
        },
      },
      discovering: {
        invoke: {
          src: "discovery",
          input: ({ context }) => ({
            client: context.client!,
            serverCapabilities: context.serverCapabilities!,
          }),
          onDone: {
            target: "ready",
            actions: [
              assign({
                instructions: ({ event }) => event.output.instructions,
                tools: ({ event }) => event.output.tools,
                resources: ({ event }) => event.output.resources,
                prompts: ({ event }) => event.output.prompts,
                resourceTemplates: ({ event }) => event.output.resourceTemplates,
              }),
            ],
          },
          onError: {
            target: "failed",
            actions: [
              assign({
                error: ({ event }) => ({
                  message: (event as any).error?.message || "Unknown error",
                  stack: (event as any).error?.stack || "",
                  code: (event as any).error?.code || -1,
                }),
              })
            ],
          },
        },
      },
      ready: {
        invoke: [{
          src: "notificationHandler",
          input: ({ context }) => ({
            client: context.client!,
            serverCapabilities: context.serverCapabilities!,
            resources: context.resources,
            prompts: context.prompts,
            resourceTemplates: context.resourceTemplates,
            tools: context.tools,
          }),
        }], 
        on: { 
        //   cleanup: {
        //     target: "cleaning",
        //   },
          "@updates.tools": {
            actions: [
              assign({
                tools: ({ event }) => event.tools,
              }),
              {
                type: "emit",
                params: ({ event }) => event,
              },
            ],
          },
          "@updates.resources": {
            actions: enqueueActions(({ event, enqueue, context}) => {
               const { resources } = event;
               const { resourceData} = context;
             
              for (const resource of resources) {
                if(!resourceData[resource.name]?.uri || resourceData[resource.name]?.uri !== resource.uri){
                   enqueue.emit({
                    type: "@updates.resource",
                    ...resource,
                   });
                   enqueue.raise({
                    type: "@updates.resource",
                    ...resource,
                   });
                
                }
              }
              enqueue.assign({
                resources: ({ event }) => event.resources,
              }); 
            
            
            }),
          },
          "@updates.resources.data": {
            actions: [
              assign({
                resourceData: ({ event, context:{resourceData} }) => {
                  const { type,name,...data } = event as MCPClient.Updates.ResourceDataUpdate;
                  return {
                    ...resourceData,
                    [name]: {
                      name,
                      ...data,
                    }
                  };
                },
              }),
              {
                type: "emit",
                params: ({ event }) => event,
              },
            ],
          },
          "@updates.prompts": {
            actions: [
              assign({
                prompts: ({ event }) => event.prompts,
              }),
              {
                type: "emit",
                params: ({ event }) => event,
              },
            ],
          },
          "@updates.resourceTemplates": {
            actions: [
              assign({
                resourceTemplates: ({ event }) => event.resourceTemplates,
              }),
            ],
          },
        },
        initial: "connected",
        states:{
            connecting:{
                entry: [
                    ({ context }) => {
                        console.log("ready.connecting", context.url.toString());
                    }, 
                    assign({
                        retries: ({ context:{retries} }) => retries + 1,
                     })
                ],
                invoke: {
                    src: "connection",
                    input: ({ context }) => ({
                        url: context.url,
                        options: context.options,
                    }),
                    onDone: {
                        target: "connected",
                        actions: assign({
                            client: ({ event }) => event.output.client,
                            transport: ({ event }) => event.output.transport,
                            serverCapabilities: ({ event }) => event.output.serverCapabilities,
                        }),
                    },
                    onError: {
                        target: "disconnected",
                        actions: assign({
                            error: ({ event }) => ({
                                message: (event as any).error?.message || "Unknown error",
                                stack: (event as any).error?.stack || "",
                                code: (event as any).error?.code || -1,
                              }),
                        }),
                    }
                }
            },
            connected:{
                entry: [
                    ({ context }) => {
                        console.log("ready.connected", context.url.toString());
                    },
                    assign({
                        error: undefined,
                    })
                ],
              invoke: {
                src: "resourceDataHandler",
                id: "@mcp/resource",
                input: ({ context }) => ({
                  client: context.client!,
                  auth: context.options.auth,
                  session: context.options.session,
                  url: context.url,
                }),
              },
              on:{
                "@mcp.error": {
                    target: "disconnected",
                    actions: assign({
                        error: ({ event }) => ({
                            message: (event as any).error?.message || "Unknown error",
                            stack: (event as any).error?.stack || "",
                            code: (event as any).error?.code || -1,
                        }),
                    }),
                },
                "@updates.resource": {
                    actions: enqueueActions(({ event, enqueue, context}) => {
                        const { type,...resource } = event;
                        enqueue.sendTo("@mcp/resource", {
                            type: "read-resource",
                            ...resource,
                        });
                    }),
                },
                "@updates.resources": {
                    actions: enqueueActions(({ event, enqueue, context}) => {
                       const { resources } = event;
                       const {resourceData, resources:existingResources} = context;
                       enqueue.assign({
                            resources: ({ event }) => event.resources,
                       });
        
                      for (const resource of event.resources) {
                        if(resourceData[resource.name]?.uri !== resource.uri){
                          enqueue.sendTo("@mcp/resource", {
                            type: "read-resource",
                             ...resource,
                          });
                        }
                      }
              
                      for (const resource of resources) {
                        if(!existingResources.some(r=>r.uri === resource.uri)){
                           enqueue.emit({
                            type: "@updates.resource",
                            ...resource,
                           });
                        }
                      }
                    }),
                  }
              }
            },
        
            disconnected:{
                entry: [
                    ({ context }) => {
                        console.log("ready.disconnected", context.url.toString(), context.error?.message);
                    },
                    ({ context:{transport,client} }) => {
                        if(transport){
                            transport.close();
                        }
                        if(client){
                            client.close();
                        }
                    }
                ],
                invoke: {
                    src:fromPromise<void, { retries: number }>(async ({ input:{retries} }) => {
                        //wait according to the retry count
                        await new Promise(resolve => setTimeout(resolve, Math.min(retries * 1000, 10)));
                    
                    }),
                    input: ({ context:{retries} }) => ({
                        retries: retries,
                    }),
                    onDone: {
                        target: "connecting",
                    }
                }
            }   

        }
      },
      failed: {
        entry: ({ context:{error} }) =>  console.warn("failed connection: ",error),
        after:{
            10_000: {
               actions:raise({
                type: "retry",
               }),
            }
        },
        on: {
          retry: {
            target: "connecting",
            actions:[ 
              assign({
                error: undefined,
                retries: ({ context:{retries} }) => retries + 1,
                client: undefined,
                transport: undefined,
              }),
              ({ context }) => {
                // Ensure old transport is cleaned up
                if (context.transport) {
                  try {
                    context.transport.close();
                  } catch (e) {
                    console.warn("Error closing transport:", e);
                  }
                }
              },
              ({ context:{retries} }) =>  console.log("retry connection:",retries)
            ],
          },
        },
      },
      cleaning: {
        invoke: {
          src: fromPromise(
            async ({
              input,
            }: {
              input: { transport: ReturnType<TransportFactory> };
            }) => {
              if (input.transport) {
                await input.transport.close();
              }
            }
          ),
          input: ({ context }) => ({ transport: context.transport! }),
        //   onDone: {
        //     target: "connected",
        //     actions: assign({
        //       client: undefined,
        //       transport: undefined,
        //     }),
        //   },
          onError: {
            target: "done",
            actions: assign({
              client: undefined,
              transport: undefined,
            }),
          },
        },
      },
      done: {
        type: "final",
      },
    },
  });


// export function fromMcpClient(
//   url: URL,
//   options: {
//     info: ConstructorParameters<typeof Client>[0];
//     client?: ConstructorParameters<typeof Client>[1];
//     transport?: TransportFactory;
//     oauthProvider?: OAuthClientProvider;
//   }
// ) {


//   return mcpClientMachine;
// }

// Helper functions
async function fetchTools(client: Client): Promise<Tool[]> {
  let toolsAgg: Tool[] = [];
  let toolsResult: ListToolsResult = { tools: [] };
  do {
    toolsResult = await client
      .listTools({
        cursor: toolsResult.nextCursor,
      })
      .catch(capabilityErrorHandler({ tools: [] }, "tools/list"));
    toolsAgg = toolsAgg.concat(toolsResult.tools);
  } while (toolsResult.nextCursor);
  return toolsAgg;
}

async function fetchResources(client: Client): Promise<Resource[]> {
  let resourcesAgg: Resource[] = [];
  let resourcesResult: ListResourcesResult = { resources: [] };
  do {
    resourcesResult = await client
      .listResources({
        cursor: resourcesResult.nextCursor,
      })
      .catch(capabilityErrorHandler({ resources: [] }, "resources/list"));
    resourcesAgg = resourcesAgg.concat(resourcesResult.resources);
  } while (resourcesResult.nextCursor);
  return resourcesAgg;
}

async function fetchPrompts(client: Client): Promise<Prompt[]> {
  let promptsAgg: Prompt[] = [];
  let promptsResult: ListPromptsResult = { prompts: [] };
  do {
    promptsResult = await client
      .listPrompts({
        cursor: promptsResult.nextCursor,
      })
      .catch(capabilityErrorHandler({ prompts: [] }, "prompts/list"));
    promptsAgg = promptsAgg.concat(promptsResult.prompts);
  } while (promptsResult.nextCursor);
  return promptsAgg;
}

async function fetchResourceTemplates(
  client: Client
): Promise<ResourceTemplate[]> {
  let templatesAgg: ResourceTemplate[] = [];
  let templatesResult: ListResourceTemplatesResult = {
    resourceTemplates: [],
  };
  do {
    templatesResult = await client
      .listResourceTemplates({
        cursor: templatesResult.nextCursor,
      })
      .catch(
        capabilityErrorHandler(
          { resourceTemplates: [] },
          "resources/templates/list"
        )
      );
    templatesAgg = templatesAgg.concat(templatesResult.resourceTemplates);
  } while (templatesResult.nextCursor);
  return templatesAgg;
}

function capabilityErrorHandler<T>(empty: T, method: string) {
  return (e: { code: number }) => {
    if (e.code === -32601) {
      console.error(
        `The server advertised support for the capability ${
          method.split("/")[0]
        }, but returned "Method not found" for '${method}'.`
      );
      return empty;
    }
    throw e;
  };
}


export default mcpClientMachine;

type Optional<T> = {
  [K in keyof T]?: T[K];
};

export namespace MCPClient {
  export type ConnectionState =
    | "connecting"
    | "discovering"
    | "ready"
    | "failed"
    | "cleaning";

  export type Error = {
    message: string;
    stack: string;
    code: number;
  };

  export type ResourceData = {
    name: string;
    mimeType: string;
    contents: any[];
    uri?: string;
  };

  export type ConnectionInput = {
    url: URL;
    options: {
      info: ConstructorParameters<typeof Client>[0];
      client?: ConstructorParameters<typeof Client>[1];
      transport?: TransportFactory;
      auth?: AuthInfo;
      session?: string;
    };
  };

  export type DiscoveryInput = {
    client: Client;
    serverCapabilities: ServerCapabilities;
  };

  export type NotificationHandlerInput = {
    client: Client;
    serverCapabilities: ServerCapabilities;
    resources: Resource[];
    prompts: Prompt[];
    resourceTemplates: ResourceTemplate[];
    tools: Tool[];
  };

  export type ResourceDataHandlerInput = {
    client: Client;
    auth: AuthInfo | undefined;
    session: string | undefined;
    url: URL;
  };

  export namespace Updates {
    export type Tools = {
      type: "@updates.tools";
      tools: Tool[];
    };
    export type ResourceUpdate = {
      type: "@updates.resource"; 
    } & Resource;
    export type Resources = {
      type: "@updates.resources";
      resources: Resource[];
    };
    export type Prompts = {
      type: "@updates.prompts";
      prompts: Prompt[];
    };
    export type ResourceTemplates = {
      type: "@updates.resourceTemplates";
      resourceTemplates: ResourceTemplate[];
    };
    export type Notifications = {
      type: "@updates.notifications";
      notifications: Notification[];
    };
    export type ResourceDataUpdate = {
      type: "@updates.resources.data";
    } & ResourceData;

    export type Event =
      | Tools
      | Resources
      | Prompts
      | ResourceTemplates
      | Notifications
      | ResourceDataUpdate
      | ResourceUpdate;
  }

  export type Event = |{
    type: "read-resource"; 
    uri: string;
    name: string;
    mimeType: string;
  }
    | {
        type: "reconnect";
      }
    | {
        type: "retry";
      }
    | {
        type: "cleanup";
      }
    | {
        type: "@mcp.error";
        message: string;
        stack: string;
        code: number;
      }
    | Updates.Event;

  export type Input = {
    url: URL;
    options?: {
      info: ConstructorParameters<typeof Client>[0];
      client?: ConstructorParameters<typeof Client>[1];
      transport?: TransportFactory;
      auth?: AuthInfo;
      session?: string;
    };
  };

  export type Context = {
    url: URL;
    options: {
      info: ConstructorParameters<typeof Client>[0];
      client?: ConstructorParameters<typeof Client>[1];
      transport?: TransportFactory;
      auth?: AuthInfo;
      session?: string;
    };
    instructions: string | undefined;
    tools: Tool[];
    prompts: Prompt[];
    resources: Resource[];
    resourceData: Record<string, ResourceData>;
    resourceTemplates: ResourceTemplate[];
    serverCapabilities: ServerCapabilities | undefined;
    error: Error | undefined;
    client: Client | undefined;
    transport: ReturnType<TransportFactory> | undefined;
    retries: number;
  };
}
