import type { McpTool, McpToolSchema } from "./mcp.types.js";
import type { OpenAiTool } from "../llm/llm.types.js";

export class Tool {
    public serverName: string;
    public name: string;
    public description: string;
    public inputSchema: McpToolSchema;

    constructor(mcpTool: McpTool, serverName: string) {
        this.name = mcpTool.name;
        this.description = mcpTool.description;
        this.inputSchema = mcpTool.inputSchema;
        this.serverName = serverName;
    }

    toOpenAiTool(): OpenAiTool {
        return {
            type: "function",
            strict: true,
            function: {
                name: `${this.serverName}-${this.name}`,
                description: this.description,
                parameters: {
                    ...this.inputSchema,
                    type: "object",
                    additionalProperties: false,
                },
            },
        };
    }
}
