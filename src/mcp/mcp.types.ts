import { z } from "zod";

export const McpToolProperty = z.object({
    type: z.string(),
    description: z.string().default(""),
});
export type mcpToolProperty = z.infer<typeof McpToolProperty>;

export const McpToolSchema = z.object({
    type: z.string(),
    properties: z.record(z.string(), McpToolProperty),
    required: z.array(z.string()).default([]),
});
export type mcpToolSchema = z.infer<typeof McpToolSchema>;

export const McpTool = z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: McpToolSchema,
});
export type mcpTool = z.infer<typeof McpTool>;

export const McpTools = z.record(z.string(), McpTool);
export type mcpTools = z.infer<typeof McpTools>;

export const McpToolsArray = z.array(McpTool);

export const SseClientConfig = z.object({
    url: z.string().url(),
    env: z.record(z.string(), z.string()).optional(),
});

export const StdioClientConfig = z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
});

export const McpClientConfig = z.union([StdioClientConfig, SseClientConfig]);
export type mcpClientConfig = z.infer<typeof McpClientConfig>;

export const McpConfig = z.object({
    mcpClients: z.record(z.string(), McpClientConfig),
});
export type mcpConfig = z.infer<typeof McpConfig>;
