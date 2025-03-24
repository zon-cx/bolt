import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Tool from "./Tools.js";
import type { ToolInputSchema } from "./Tools.js";

interface ToolProperty {
    type: string;
    description: string;
    required?: boolean;
}

interface MCPToolSchema {
    type: string;
    properties: Record<string, ToolProperty>;
    required?: string[];
}

interface MCPTool {
    name: string;
    description: string;
    inputSchema: MCPToolSchema;
}

/**
 * Manages MCP server connections and tool execution.
 */
export class MCPClient {
    private name: string;
    private config: Record<string, any>;
    private transport: SSEClientTransport | null;
    private client: Client | null;
    constructor(name: string, config: Record<string, any>) {
        this.name = name;
        this.config = config;
        this.transport = null;
        this.client = null;
    }

    /**
     * Initialize the server connection.
     */
    async initialize() {
        try {
            console.log("Initializing MCP client with MCP Servers config \n", this.config);
            this.transport = new SSEClientTransport(new URL(this.config.url));

            this.client = new Client(
                {
                    name: "slack-mcp-client",
                    version: "1.0.0",
                },
                {
                    capabilities: {
                        prompts: {},
                        resources: {},
                        tools: {},
                    },
                },
            );
            await this.client.connect(this.transport);
        } catch (error) {
            console.error(`Error initializing server ${this.name}: ${error}`);
            throw error;
        }
    }

    async listTools(): Promise<Tool[]> {
        if (!this.client) {
            throw new Error(`Server ${this.name} not initialized`);
        }
        const tools = (await this.client.listTools()).tools as MCPTool[];
        const toolList = tools
            .map((tool) => {
                try {
                    // Validate that the tool has the required schema structure
                    if (
                        !tool.inputSchema ||
                        !tool.inputSchema.properties ||
                        typeof tool.inputSchema.properties !== "object"
                    ) {
                        console.warn(`Tool ${tool.name} has invalid schema structure and will be skipped`);
                        return null;
                    }

                    const properties = tool.inputSchema.properties;
                    const required = tool.inputSchema.required || [];

                    // Validate each property has the required fields
                    for (const [key, value] of Object.entries(properties)) {
                        if (!value || typeof value !== "object" || !value.type || !value.description) {
                            console.warn(
                                `Tool ${tool.name} has invalid property structure for ${key} and will be skipped`,
                            );
                            return null;
                        }
                    }

                    // Mark required parameters
                    Object.keys(properties).forEach((key) => {
                        if (required.includes(key) && properties[key]) {
                            properties[key].required = true;
                        }
                    });

                    const inputSchema: ToolInputSchema = {
                        properties,
                        required,
                    };

                    return new Tool(tool.name, tool.description, inputSchema);
                } catch (error) {
                    console.warn(`Error processing tool ${tool.name}: ${error}`);
                    return null;
                }
            })
            .filter((tool): tool is Tool => tool !== null);

        return toolList;
    }

    /**
     * Execute a tool with retry mechanism.
     * @param toolName Name of the tool to execute
     * @param toolArgs Tool arguments
     * @param retries Number of retry attempts
     * @param delay Delay between retries in seconds
     * @returns Tool execution result
     * @throws Error if server is not initialized or tool execution fails after all retries
     */
    async executeTool(
        toolName: string,
        toolArgs: Record<string, any>,
        retries: number = 2,
        delay: number = 1.0,
    ): Promise<any> {
        if (!this.client) {
            throw new Error(`Server ${this.name} not initialized`);
        }

        let attempt = 0;
        while (attempt < retries) {
            try {
                const result = await this.client.callTool({
                    name: toolName,
                    arguments: toolArgs,
                });
                return result;
            } catch (e) {
                attempt += 1;
                console.warn(`Error executing tool: ${e}. Attempt ${attempt} of ${retries}.`);

                if (attempt < retries) {
                    console.log(`Retrying in ${delay} seconds...`);
                    await new Promise((resolve) => setTimeout(resolve, delay * 1000));
                } else {
                    console.error("Max retries reached. Failing.");
                    throw e;
                }
            }
        }
    }
}

export default MCPClient;
