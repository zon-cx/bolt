import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import Tool from "./Tools.js";

/**
 * Manages MCP server connections and tool execution.
 */
class MCPClient {
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
            this.client.connect(this.transport);
        } catch (error) {
            console.error(`Error initializing server ${this.name}: ${error}`);
            throw error;
        }
    }

    async listTools(): Promise<Tool[]> {
        if (!this.client) {
            throw new Error(`Server ${this.name} not initialized`);
        }
        const tools = await this.client.listTools();
        console.log(tools);
        return (
            tools as unknown as Array<{
                name: string;
                description: string;
                parameters: Record<string, any>;
            }>
        ).map((tool) => {
            return new Tool(tool.name, tool.description, tool.parameters);
        });
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
