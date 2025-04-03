import { z } from "zod";

export const McpToolProperty = z.object({
    type: z.string(),
    description: z.string().default(""),
});
export type McpToolProperty = z.infer<typeof McpToolProperty>;

export const McpToolSchema = z.object({
    type: z.string(),
    properties: z.record(z.string(), McpToolProperty),
    required: z.array(z.string()).default([]),
});
export type McpToolSchema = z.infer<typeof McpToolSchema>;

export const McpTool = z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: McpToolSchema,
});
export type McpTool = z.infer<typeof McpTool>;

export const McpTools = z.record(z.string(), McpTool);
export type McpTools = z.infer<typeof McpTools>;

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
export type McpClientConfig = z.infer<typeof McpClientConfig>;

export const McpConfig = z.object({
    mcpServers: z.record(z.string(), McpClientConfig),
});
export type McpConfig = z.infer<typeof McpConfig>;
