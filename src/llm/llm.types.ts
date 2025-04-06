export type OpenAiTool = {
    type: "function";
    strict: boolean;
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties?: Record<string, { type: string; description: string }>;
            required?: string[];
            additionalProperties: boolean;
        };
    };
};
