export type ToolInputSchema = {
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
};

class Tool {
    public name: string;
    public description: string;
    public inputSchema: ToolInputSchema;

    constructor(name: string, description: string, inputSchema: ToolInputSchema) {
        this.name = name;
        this.description = description;
        this.inputSchema = inputSchema;
    }

    formatForLLM(): string {
        /**
         * Format tool information for LLM.
         *
         * @returns A formatted string describing the tool.
         */
        console.log("Tool Input shema for tool", this.name, "is ", this.inputSchema.properties);
        const argsDescriptions: string[] = [];

        for (const [paramName, paramInfo] of Object.entries(this.inputSchema.properties)) {
            let argDescription = `- ${paramName}: ${paramInfo.type} - ${paramInfo.description}`;
            if (this.inputSchema.required?.includes(paramName)) {
                argDescription += " (required)";
            }

            argsDescriptions.push(argDescription);
        }
        const formattedTool = `
            Tool: ${this.name}
            Description: ${this.description}
            Arguments:
            ${argsDescriptions.join("\n")}`;

        return formattedTool;
    }
}

export default Tool;
