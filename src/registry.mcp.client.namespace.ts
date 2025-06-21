import { auth, OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import type { RequestHandlerExtra, RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequest,
  CallToolResult,
  CompleteRequestSchema,
  ReadResourceRequestSchema,
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
import { ActorRefFromLogic } from "xstate";
import mcpClientMachine from "./mcp.client";


type NamespacedSource = {
  name: string;
  uri?: string;
  source: {
    name: string;
    uri?: string;
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

// Separate stores for namespaced data management
export class NamespacedDataStore {
  public tools = createAtom<NamespacedData["tools"]>([]);
  public prompts = createAtom<NamespacedData["prompts"]>([]);
  public resources = createAtom<NamespacedData["resources"]>([]);
  public resourceTemplates = createAtom<NamespacedData["resourceTemplates"]>([]);
  public aiTools = createAtom<ToolSet>({});

  private mcpActors: Record<string, ActorRefFromLogic<typeof mcpClientMachine>> = {};

  constructor() {
    // Subscribe to changes and update aggregated data
    this.tools.subscribe(() => {
      this.aiTools.set(this.getAITools());
    });
  }

  registerClient(id: string, actor: ActorRefFromLogic<typeof mcpClientMachine>) {
    this.mcpActors[id] = actor;
    
    // Subscribe to client updates
    actor.subscribe((snapshot) => {
      if (snapshot.matches("ready")) {
        this.updateAggregatedData();
      }
    });
    
    this.updateAggregatedData();
  }

  unregisterClient(id: string) {
    delete this.mcpActors[id];
    this.updateAggregatedData();
  }

  private updateAggregatedData() {
    this.tools.set(this.getNamespacedData("tools"));
    this.prompts.set(this.getNamespacedData("prompts"));
    this.resources.set(this.getNamespacedData("resources"));
    this.resourceTemplates.set(this.getNamespacedData("resourceTemplates"));
  }

  private getNamespacedData<T extends keyof NamespacedData>(type: T): NamespacedData[T] {
    const sets = Object.entries(this.mcpActors).map(([name, actor]) => {
      const snapshot = actor.getSnapshot();
      return { name, data: snapshot.context[type] };
    });

    const namespacedData = sets.flatMap(({ name: server, data }) => {
      if (!data || !Array.isArray(data)) {
        return [];
      }

      try {
        return data.map((resource: any) => {
          const { name, uri, uriTemplate, ...item } = resource;
          let resourceUri: string | undefined = undefined;
          let resourceUriTemplate: string | undefined = undefined;
          
          if (typeof uri === "string") {
            resourceUri = uri;
          }
          if (typeof uriTemplate === "string") {
            resourceUriTemplate = uriTemplate;
            // For resource templates, use uriTemplate as the uri if uri is not set
            if (!resourceUri) {
              resourceUri = uriTemplate;
            }
          }
          
          const result = {
            ...item,
            name: `${server}:${name}`,
            source: {
              uri: resourceUri,
              name,
              server,
            },
          };
          
          // Add uri field if we have a resource URI
          if (resourceUri) {
            result.uri = `${server}:${resourceUri}`;
          }
          
          // For resource templates, preserve the uriTemplate field
          if (type === "resourceTemplates" && resourceUriTemplate) {
            result.uriTemplate = `${server}:${resourceUriTemplate}`;
          }
          
          return result;
        });
      } catch (error) {
        console.error(`Error getting ${type} data from client ${server}:`, error);
        return [];
      }
    });

    return namespacedData as NamespacedData[T];
  }

  private getAITools(): ToolSet {
    return Object.fromEntries(
      this.tools.get().map((tool) => {
        return [
          tool.name,
          {
            parameters: jsonSchema(tool.inputSchema),
            description: tool.description,
            execute: async (args) => {
              // This would need to be implemented with a callback to the manager
              throw new Error("Tool execution not implemented in store");
            },
          },
        ];
      })
    );
  }

   public async readResource( params: Zod.infer<typeof ReadResourceRequestSchema>["params"],
    {authInfo, sendRequest, sendNotification, signal, requestId, sessionId, _meta}: RequestHandlerExtra<ReadResourceRequest, any>,
    options?: RequestOptions) {

      const { uri, name, ...otherParams } = params;
      const searchKey = name || uri;
      if (!searchKey || typeof searchKey !== 'string') {
        throw new Error("Either name or uri must be provided as a string");
      }
      
      const {server, uri: resourceUri, name: resourceName} = await this.findSource(this.resources, searchKey);
      if(!resourceUri){
        throw new Error(`Resource URI not found for ${searchKey}`);
      }
      const mcpActor = this.mcpActors[server];
      if(!mcpActor){
        throw new Error(`MCP client for server ${server} not found`);
      }
      const mcpSnapshot = mcpActor.getSnapshot();
      if(!mcpSnapshot.matches("ready") || !mcpSnapshot.context.client){
        throw new Error(`MCP client for server ${server} not ready`);
      }
      const client = mcpSnapshot.context.client;
      const readResult = await client.readResource({uri: resourceUri, name: resourceName, ...otherParams}, options);
      return readResult;
    }

 public async complete( { ref, ...params }: Zod.infer<typeof CompleteRequestSchema>["params"],
    {authInfo, sendRequest, sendNotification, signal, requestId, sessionId, _meta}: RequestHandlerExtra<CompleteRequest, any>,
    options?: RequestOptions) {
      
      console.log(`[complete] Starting completion for ref:`, ref);
      
      let source;
      let templateUri: string | undefined;
      
      if (ref.type === "ref/resource") {
        // For resource refs, we need to find the matching resource template
        const templates = this.resourceTemplates.get();
        console.log(`[complete] Found ${templates.length} resource templates`);
        
        // First check if any template pattern matches our URI
        for (const template of templates) {
          // template is of type (ResourceTemplate & NamespacedSource)
          // template.uri contains the namespaced URI pattern
          const templateUriPattern = template.uri as string;
          console.log(`[complete] Checking template ${template.name} with pattern ${templateUriPattern}`);
          
          if (templateUriPattern && this.matchesTemplate(ref.uri, templateUriPattern)) {
            console.log(`[complete] Found matching template!`);
            // Found a matching template - use the template's original pattern URI
            // The source object contains the original (non-namespaced) data
            templateUri = template.source.uri;
            source = {
              name: template.source.name,
              server: template.source.server,
              uri: templateUri
            };
            console.log(`[complete] Using template URI: ${templateUri} for server: ${source.server}`);
            break;
          }
        }
        
        if (!source) {
          console.log(`[complete] No matching template found, trying direct lookup`);
          // Try direct lookup in resource templates
          try {
            source = await this.findSource(this.resourceTemplates, ref.uri);
            templateUri = source.uri;
            console.log(`[complete] Found via direct lookup: ${templateUri}`);
          } catch {
            // Fall back to looking for the resource itself
            console.log(`[complete] Falling back to resource lookup`);
            try {
              source = await this.findSource(this.resources, ref.uri);
              console.log(`[complete] Found resource: ${source.uri}`);
            } catch (error) {
              throw new Error(
                `No MCP client found for resource/template with URI: ${ref.uri}`
              );
            }
          }
        }
      } else {
        // For prompt refs, look in prompts
        source = await this.findSource(this.prompts, ref.name);
      }

    if (!source || !source.server) {
      throw new Error(
        `No MCP client found for ${ref.type === "ref/resource" ? "resource/template" : "prompt"} - name: ${ref.name}  URI: ${ref.uri}  URI Template: ${ref.uriTemplate}`
      );
    }
      const {server} = source;
      const mcpActor = this.mcpActors[server];
      if(!mcpActor){
        throw new Error(`MCP client for server ${server} not found`);
      }
      const mcpSnapshot = mcpActor.getSnapshot();
      if(!mcpSnapshot.matches("ready") || !mcpSnapshot.context.client){
        throw new Error(`MCP client for server ${server} not ready`);
      }
      const client = mcpSnapshot.context.client;
      
      // Create the proper ref object based on type
      // For resource templates, use the template pattern URI, not the instance URI
      const updatedRef = ref.type === "ref/resource" 
        ? { ...ref, uri: templateUri || source.uri || ref.uri }
        : { ...ref, name: source.name };
      
      console.log(`[complete] Sending completion request to ${server} with ref:`, updatedRef);
        
      const completeResult = await client.complete({ref: updatedRef, ...params}, options);
      return completeResult;
    }

  private matchesTemplate(uri: string, template: string): boolean {
    // Simple template matching - converts {param} to regex
    // Remove namespace prefix if present
    const cleanUri = uri.includes(':') && uri.split(':').length > 2 ? uri.split(':').slice(1).join(':') : uri;
    const cleanTemplate = template.includes(':') && template.split(':').length > 2 ? template.split(':').slice(1).join(':') : template;
    
    const regexPattern = cleanTemplate.replace(/{[^}]+}/g, '[^/]+');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(cleanUri);
  }

  public async callTool( { name, ...params }: Zod.infer<typeof CallToolRequestSchema>["params"],
    {authInfo, sendRequest, sendNotification, signal, requestId, sessionId, _meta}: RequestHandlerExtra<CallToolRequest, any>,
    resultSchema?:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema,
    options?: RequestOptions) {

      const {server,  name: toolName} = await this.findSource(this.tools, name);
      const mcpActor = this.mcpActors[server];
      if(!mcpActor){
        throw new Error(`MCP client for server ${server} not found`);
      }
      const mcpSnapshot = mcpActor.getSnapshot();
      if(!mcpSnapshot.matches("ready") || !mcpSnapshot.context.client){
        throw new Error(`MCP client for server ${server} not ready`);
      }
      const client = mcpSnapshot.context.client;
      const toolResult = await client.callTool({name: toolName, ...params}, resultSchema,options);
      return toolResult;
    }

  async findSource<
  T extends NamespacedData[keyof NamespacedData][number] = NamespacedData[keyof NamespacedData][number]
>(
  atom: Atom<T[]>,
  name: string
): Promise<{ name: string; server: string; uri?: string }> {
  const result = await findAsync(
    atom,
    (value: T) =>
      (value && (value as any).name === name) ||
      ((value as any).uri && (value as any).uri === name) ||
      ((value as any).uriTemplate && (value as any).uriTemplate === name)
  );
  if (!result || !(result as any).source) {
    throw new Error(
      `Resource with uri '${name}' not found in any MCP client connection.`
    );
  }
  return {
    name: ((result as any).source as any).name,
    server: ((result as any).source as any).server,
    uri: ((result as any).source as any).uri,
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

}