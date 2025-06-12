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
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPServerTransport ,StreamableHTTPServerTransportOptions} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { env } from "node:process";
import { createAtom, Atom } from "@xstate/store";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { jsonSchema, tool, ToolExecutionOptions } from "ai";

export class MCPClientConnection {
  public client: Client;
  public connectionState: Atom<
    | "authenticating"
    | "connecting"
    | "ready"
    | "discovering"
    | "failed"
  >;
  public instructions: Atom<string | undefined>;
  public tools: Atom<Tool[]>;
  public prompts: Atom<Prompt[]>;
  public resources: Atom<Resource[]>;
  public resourceTemplates: Atom<ResourceTemplate[]>;
  public serverCapabilities: Atom<ServerCapabilities | undefined>;
  public transport: Transport;
  public name: string;
  constructor(
    public url: URL,
    public options: {
      info: ConstructorParameters<typeof Client>[0];
      client?: ConstructorParameters<typeof Client>[1];
      transport?: Transport;
    },
  ) {
    const { info, client, transport } = this.options || {};
    this.transport = transport ?? new StreamableHTTPClientTransport(url);
    this.name = info?.name;
    this.connectionState = createAtom<
      | "authenticating"
      | "connecting"
      | "ready"
      | "discovering"
      | "failed"
    >("connecting");
    this.instructions = createAtom<string | undefined>(undefined);
    this.tools = createAtom<Tool[]>([]);
    this.prompts = createAtom<Prompt[]>([]);
    this.resources = createAtom<Resource[]>([]);
    this.resourceTemplates = createAtom<ResourceTemplate[]>([]);
    this.serverCapabilities = createAtom<ServerCapabilities | undefined>(undefined);
    this.client = new Client(info, client);

  }

  /**
   * Initialize a client connection
   */
  async init() {
    try {
   
      await this.client.connect(this.transport);
      // biome-ignore lint/suspicious/noExplicitAny: allow for the error check here
    } catch (e: any) {
      if (e.toString().includes("Unauthorized")) {
        // unauthorized, we should wait for the user to authenticate
        this.connectionState.set("authenticating");
        return;
      }
      this.connectionState.set("failed");
      throw e;
    }

    this.connectionState.set("discovering");

    const serverCapabilities = await this.client.getServerCapabilities();
    if (!serverCapabilities) {
      throw new Error("The MCP Server failed to return server capabilities");
    }
    this.serverCapabilities.set(serverCapabilities);

    const [instructions, tools, resources, prompts, resourceTemplates] = await Promise.all([
      this.client.getInstructions(),
      this.registerTools(),
      this.registerResources(),
      this.registerPrompts(),
      this.registerResourceTemplates(),
    ]);

    this.instructions.set(instructions);
    this.tools.set(tools);
    this.resources.set(resources);
    this.prompts.set(prompts);
    this.resourceTemplates.set(resourceTemplates);

    this.connectionState.set("ready");
  }

  /**
   * Notification handler registration
   */
  async registerTools(): Promise<Tool[]> {
    const serverCapabilities = this.serverCapabilities.get();
    if (!serverCapabilities || !serverCapabilities.tools) {
      return [];
    }

    if (serverCapabilities.tools.listChanged) {
      this.client.setNotificationHandler(
        ToolListChangedNotificationSchema,
        async (_notification) => {
          const tools = await this.fetchTools();
          this.tools.set(tools);
        },
      );
    }

    return this.fetchTools();
  }

  async registerResources(): Promise<Resource[]> {
    const serverCapabilities = this.serverCapabilities.get();
    if (!serverCapabilities || !serverCapabilities.resources) {
      return [];
    }

    if (serverCapabilities.resources.listChanged) {
      this.client.setNotificationHandler(
        ResourceListChangedNotificationSchema,
        async (_notification) => {
          const resources = await this.fetchResources();
          this.resources.set(resources);
        },
      );
    }

    return this.fetchResources();
  }

  async registerPrompts(): Promise<Prompt[]> {
    const serverCapabilities = this.serverCapabilities.get();
    if (!serverCapabilities || !serverCapabilities.prompts) {
      return [];
    }

    if (serverCapabilities.prompts.listChanged) {
      this.client.setNotificationHandler(
        PromptListChangedNotificationSchema,
        async (_notification) => {
          const prompts = await this.fetchPrompts();
          this.prompts.set(prompts);
        },
      );
    }

    return this.fetchPrompts();
  }

  async registerResourceTemplates(): Promise<ResourceTemplate[]> {
    const serverCapabilities = this.serverCapabilities.get();
    if (!serverCapabilities || !serverCapabilities.resources) {
      return [];
    }

    return this.fetchResourceTemplates();
  }

  async fetchTools() {
    let toolsAgg: Tool[] = [];
    let toolsResult: ListToolsResult = { tools: [] };
    do {
      toolsResult = await this.client
        .listTools({
          cursor: toolsResult.nextCursor,
        })
        .catch(capabilityErrorHandler({ tools: [] }, "tools/list"));
      toolsAgg = toolsAgg.concat(toolsResult.tools);
    } while (toolsResult.nextCursor);
    return toolsAgg;
  }

  async fetchResources() {
    let resourcesAgg: Resource[] = [];
    let resourcesResult: ListResourcesResult = { resources: [] };
    do {
      resourcesResult = await this.client
        .listResources({
          cursor: resourcesResult.nextCursor,
        })
        .catch(capabilityErrorHandler({ resources: [] }, "resources/list"));
      resourcesAgg = resourcesAgg.concat(resourcesResult.resources);
    } while (resourcesResult.nextCursor);
    return resourcesAgg;
  }

  async fetchPrompts() {
    let promptsAgg: Prompt[] = [];
    let promptsResult: ListPromptsResult = { prompts: [] };
    do {
      promptsResult = await this.client
        .listPrompts({
          cursor: promptsResult.nextCursor,
        })
        .catch(capabilityErrorHandler({ prompts: [] }, "prompts/list"));
      promptsAgg = promptsAgg.concat(promptsResult.prompts);
    } while (promptsResult.nextCursor);
    return promptsAgg;
  }

  async fetchResourceTemplates() {
    let templatesAgg: ResourceTemplate[] = [];
    let templatesResult: ListResourceTemplatesResult = {
      resourceTemplates: [],
    };
    do {
      templatesResult = await this.client
        .listResourceTemplates({
          cursor: templatesResult.nextCursor,
        })
        .catch(
          capabilityErrorHandler(
            { resourceTemplates: [] },
            "resources/templates/list",
          ),
        );
      templatesAgg = templatesAgg.concat(templatesResult.resourceTemplates);
    } while (templatesResult.nextCursor);
    return templatesAgg;
  }

  async cleanup() {
    await this.transport.close();
  }
}

function capabilityErrorHandler<T>(empty: T, method: string) {
  return (e: { code: number }) => {
    // server is badly behaved and returning invalid capabilities. This commonly occurs for resource templates
    if (e.code === -32601) {
      console.error(
        `The server advertised support for the capability ${
          method.split("/")[0]
        }, but returned "Method not found" for '${method}'.`,
      );
      return empty;
    }
    throw e;
  };
}

