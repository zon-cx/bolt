class Tool {
    public name: string;
    public description: string;
    public parameters: Record<string, any>;

    constructor(name: string, description: string, parameters: Record<string, any>) {
        this.name = name;
        this.description = description;
        this.parameters = parameters;
    }

    formatForLLM(): string {
        /**
         * Format tool information for LLM.
         *
         * @returns A formatted string describing the tool.
         */
        const argsDescriptions: string[] = [];

        if (this.parameters && this.parameters.properties) {
            for (const [paramName, paramInfo] of Object.entries(this.parameters.properties)) {
                let argDescription = `- ${paramName}: ${(paramInfo as any).description || "No description"}`;

                if (this.parameters.required && this.parameters.required.includes(paramName)) {
                    argDescription += " (required)";
                }

                argsDescriptions.push(argDescription);
            }
        }

        return `
            Tool: ${this.name}
            Description: ${this.description}
            Arguments:
            ${argsDescriptions.join("\n")}`;
    }
}

export default Tool;
