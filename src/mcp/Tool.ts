import type { mcpTool, mcpToolSchema } from "./mcp.types.js";

export class Tool {
    public serverName: string;
    public name: string;
    public description: string;
    public inputSchema: mcpToolSchema;

    constructor(mcpTool: mcpTool, serverName: string) {
        this.name = mcpTool.name;
        this.description = mcpTool.description;
        this.inputSchema = mcpTool.inputSchema;
        this.serverName = serverName;
    }

    formatForLLM(): string {
        /**
         * Format tool information for LLM.
         *
         * @returns A formatted string describing the tool.
         */

        const formattedTool = `
            Tool: ${this.serverName}.${this.name}
            Description: ${this.description}
            Arguments:
            ${this.getArgsDescriptions().join("\n")}`;

        return formattedTool;
    }

    getArgsDescriptions(): string[] {
        const argsDescriptions: string[] = [];
        Object.entries(this.inputSchema.properties).forEach(([name, property]) => {
            let argDescription = `- ${name}: `;
            if (this.inputSchema.required?.includes(name)) {
                argDescription += "REQUIRED - ";
            }
            argDescription += "type: " + property.type + " - " + property.description;
            argsDescriptions.push(argDescription);
        });
        return argsDescriptions;
    }

    formatForSlack(): string {
        const formattedTool = `
            Tool: ${this.serverName}.${this.name}
            Description: ${this.description}`;

        return formattedTool;
    }
}
