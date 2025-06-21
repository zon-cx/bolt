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

// Simplified version without MCPSession class and useServer pattern


  const mcpClientSetup = setup({
    types: {} as {
      context: MCPClient.Context;
      events: MCPClient.Event;
      input: Optional<MCPClient.Input>;
          actors: {
      connection: ActorLogic<any, any, any, any, any>;
      discovery: ActorLogic<any, any, any, any, any>;
      notificationHandler: ActorLogic<any, any, any, any, any>;
      resourceReader: ActorLogic<any, any, any, any, any>;
    };
    },
    actors: {
      connection: fromPromise(
        async ({ input }: { input: MCPClient.ConnectionInput }) => {
          const { url, options } = input;
          const { info, auth, transport:transportFactory } = options;
          
          console.log("connecting to", url.toString());
          
          // Create transport
          const transport =transportFactory? transportFactory() : new StreamableHTTPClientTransport(new URL(url), {
            requestInit: auth?.token
              ? {
                  headers: {
                    Authorization: `Bearer ${auth.token}`,
                  }
                }
              : undefined,
          });

          // Create client
          const client = new Client({
            name: info.name || "mcp-client",
            version: info.version || "1.0.0",
          });

          try {
            // Connect with timeout
            await Promise.race([
              client.connect(transport),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Connection timeout")), 10000);
              })
            ]);
            
            console.log("Client connected, attempting ping", url.href);
            
            // Ping with timeout
            await Promise.race([
              client.ping(),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Ping timeout")), 5000);
              })
            ]);
            
            console.log("Client ping successful", url.href);
            
            // Get server capabilities
            const serverCapabilities = await client.getServerCapabilities();
            
            return {
              client,
              transport,
              serverCapabilities,
            };
          } catch (error:any) {
            if (error instanceof UnauthorizedError || error.message?.includes("Authorization") || error.message?.includes("HTTP 401")) {
                throw error
            }
            console.error("Failed to initialize client:", error);

            try {
              await transport.close();
            } catch (closeError) {
              console.error("Error closing transport:", closeError);
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
              fetchTools(client).catch(capabilityErrorHandler([], "tools/list")),
              fetchResources(client).catch(capabilityErrorHandler([], "resources/list")),
              fetchPrompts(client).catch(capabilityErrorHandler([], "prompts/list")),
              fetchResourceTemplates(client).catch(capabilityErrorHandler([], "resourceTemplates/list")),
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
      resourceReader: fromPromise(
        async ({ input }: { input: MCPClient.ResourceReaderInput }) => {
          const { client, resource } = input;
          const { uri, name, mimeType } = resource;
          
          console.log("reading resource", uri);
          
          let timeoutId: NodeJS.Timeout | undefined;
          try {
            const result = await Promise.race([
              client.readResource({ uri }),
              new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                  console.log("Resource read timeout for", uri);
                  reject(new Error("Resource read timeout"));
                }, 5000);
              })
            ]) as { contents: any[] };
            
            if (timeoutId) clearTimeout(timeoutId);
            
            console.log("Resource read complete", uri);
            
            // Process contents based on MIME type
            let processedContents;
            if (mimeType === "application/json") {
              processedContents = result.contents
                .map((content) => content.text as string)
                .filter(Boolean)
                .map(e => JSON.parse(e));
            } else if (mimeType === "text/plain") {
              processedContents = result.contents.map((content) => content.text);
            } else {
              processedContents = result.contents;
            }
            
            return {
              name,
              uri,
              mimeType,
              contents: processedContents,
            };
          } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            console.error("Error reading resource:", error);
            throw error;
          }
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
      pendingResourceReads: new Set<string>(),
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
          onError: [
            {
              target: "authenticating",
              actions: [
                assign({
                  error: ({ event }) => ({
                    message: (event as any).error?.message || "Authentication required",
                    stack: (event as any).error?.stack || "",
                    code: 401,
                  }),
                })
              ],
              guard: ({ event }) => {
                const error = (event as any).error;
                return error?.message?.includes("Unauthorized");
              },
            },
            {
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
          ],
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
        invoke: {
          src: "notificationHandler",
          input: ({ context }) => ({
            client: context.client!,
            serverCapabilities: context.serverCapabilities!,
            resources: context.resources,
            prompts: context.prompts,
            resourceTemplates: context.resourceTemplates,
            tools: context.tools,
          }),
        },
        on: {
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
            actions: enqueueActions(({ event, enqueue, context }) => {
              const { resources } = event;
              const { resourceData } = context;

              // Update resources
              enqueue.assign({
                resources: resources,
              });

              // Trigger reads for new or changed resources
              for (const resource of resources) {
                if (!resourceData[resource.name]?.uri || resourceData[resource.name]?.uri !== resource.uri) {
                  enqueue.emit({
                    type: "@updates.resource",
                    ...resource,
                  });
                  enqueue.raise({
                    type: "read-resource",
                    uri: resource.uri,
                    name: resource.name,
                    mimeType: resource.mimeType || "text/plain",
                  });
                }
              }
            }),
          },
          
          "read-resource": {
            actions: enqueueActions(({ event, enqueue, context, self }) => {
              const resource = event as MCPClient.Event & { uri: string; name: string; mimeType: string };
              
              // Skip if already reading this resource
              if (context.pendingResourceReads?.has(resource.uri)) {
                console.log("Already reading resource", resource.uri);
                return;
              }
              
              // Mark as pending
              enqueue.assign({
                pendingResourceReads: new Set([...(context.pendingResourceReads || []), resource.uri]),
              });
              
              // Use the resourceReader actor directly
              enqueue(async ({ context }) => {
                try {
                  const result = await context.client!.readResource({ uri: resource.uri });
                  
                  // Process contents based on MIME type
                  let processedContents;
                  if (resource.mimeType === "application/json") {
                    processedContents = result.contents
                      .map((content) => content.text as string)
                      .filter(Boolean)
                      .map(e => JSON.parse(e));
                  } else if (resource.mimeType === "text/plain") {
                    processedContents = result.contents.map((content) => content.text);
                  } else {
                    processedContents = result.contents;
                  }
                  
                  self.send({
                    type: "@updates.resources.data",
                    name: resource.name,
                    uri: resource.uri,
                    mimeType: resource.mimeType,
                    contents: processedContents,
                  });
                } catch (error) {
                  console.error("Error reading resource:", error);
                } finally {
                  // Clean up pending reads
                  const newSet = new Set(context.pendingResourceReads);
                  newSet.delete(resource.uri);
                  self.send({
                    type: "@updates.resources",
                    resources: context.resources,
                  });
                }
              });
            }),
          },
          
          "@updates.resources.data": {
            actions: [
              assign({
                resourceData: ({ event, context }) => {
                  const { type, name, ...data } = event as MCPClient.Updates.ResourceDataUpdate;
                  return {
                    ...context.resourceData,
                    [name]: {
                      name,
                      ...data,
                    },
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
          
          retry: {
            target: "connecting",
            actions: [
              assign({
                error: undefined,
                retries: ({ context }) => context.retries + 1,
                client: undefined,
                transport: undefined,
                pendingResourceReads: new Set(),
              }),
              ({ context }) => {
                console.log("Retrying connection:", context.retries);
              },
            ],
          },
        },
      },
      failed: {
        entry: ({ context:{error} }) =>  console.warn("failed connection: ",error),
        after:{
            10_000: {
               actions:raise({
                type: "retry",
               }),
               guard: ({ context }) => {
                 // Don't retry if authentication is required
                 return !context.error?.message?.includes("Authentication required");
               },
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
            guard: ({ context }) => {
              // Don't retry if authentication is required
              return !context.error?.message?.includes("Authentication required");
            },
          },
          authenticate: {
            target: "authenticating",
            actions: [
              assign({
                error: undefined,
              }),
            ],
          },
        },
      },
      authenticating: {
        entry: ({ context }) => {
          console.log("Entering authenticating state", context.error);
        },
        on: {
          authenticate: {
            target: "connecting",
            actions: [
              assign({
                error: undefined,
                retries: ({ context }) => context.retries + 1,
              }),
            ],
          },
          retry: {
            target: "connecting",
            actions: [
              assign({
                error: undefined,
                retries: ({ context }) => context.retries + 1,
                client: undefined,
                transport: undefined,
                pendingResourceReads: new Set(),
              }),
            ],
          },
        },
        // after: {
        //   30000: {
        //     target: "failed",
        //     actions: assign({
        //       error: {
        //         message: "Authentication timeout",
        //         stack: "",
        //         code: 408,
        //       },
        //     }),
        //   },
        // },
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
    | "cleaning"
    | "authenticating";

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

  export type ResourceReaderInput = {
    client: Client;
    resource: {
      uri: string;
      name: string;
      mimeType: string;
    };
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
        type: "authenticate";
        authCode?: string;
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
    pendingResourceReads: Set<string>;
  };
}
