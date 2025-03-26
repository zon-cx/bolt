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

export const SseServerConfig = z.object({
    url: z.string().url(),
    env: z.record(z.string(), z.string()).optional(),
});

export const StdioServerConfig = z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
});

export const McpServerConfig = z.union([StdioServerConfig, SseServerConfig]);
export type mcpServerConfig = z.infer<typeof McpServerConfig>;

export const McpConfig = z.object({
    mcpServers: z.record(z.string(), McpServerConfig),
});
export type mcpConfig = z.infer<typeof McpConfig>;
