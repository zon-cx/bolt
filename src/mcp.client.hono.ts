import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  type Tool,
  type Resource,
  type Prompt,
  type ResourceTemplate,
  type ListToolsResult,
  type ListResourcesResult,
  type ListPromptsResult,
  type ListResourceTemplatesResult,
} from "@modelcontextprotocol/sdk/types.js";

// The remote MCP registry server and auth token provided by the user.
const MCP_URL = new URL("https://registry.cfapps.eu12.hana.ondemand.com/mcp");
const AUTH_TOKEN =
  "eyJ0eXAiOiJhdCtKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik9FVkJNVU0xUkVWQ1JEQXpPVEZGTlRJNE0wSXhRemN6UXpJM056UkRORFkzT0VORVF6Y3dNQSIsImN0eF9tb2RlIjoibG9naW4ifQ.eyJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiaWF0IjoxNzQ4MTIzMjI2LCJleHAiOjE3Nzk2NTkyMjYsImNsaWVudF9pZCI6ImRjci5WWk9SQmwyTWZpOE5ub0tpRVk2enNGNmxDaWh4NjZINFBDUVJlZyIsImF1ZCI6ImRjci5WWk9SQmwyTWZpOE5ub0tpRVk2enNGNmxDaWh4NjZINFBDUVJlZyIsImlzcyI6Imh0dHBzOi8vZ2lneWEuYXV0aHouaWQvb2lkYy9vcC92MS4wLzRfeUNYdXZRNTJVeDUyQmRhUVR4VVZoZyIsInN1YiI6IjRkYjI3ODg3ZjE1ODQ3ZjliZTFjY2Y5MjMzNGRmYmIzIiwic2lkIjoiMzAzMjc0NzQwMjI2X0xnSVZvTWxmV24tTlFLT1kzajBLV3ZkeHhwMCIsImp0aSI6InN0Mi5zLkF0THR0Tkx0MmcuYl9QZkZzT1YwVFctQzlfSG80OXRPVFcwcF9uWHItYWtnQVJXeEoxdk9kMDhHa3ZpU3J1RVJqU0tncDltNTdsbXk4MHN5eHBNT0ZhaGlVZFNoa3JUd0d1Wjl3MC0yVUVFVUVVc2s0bDlNSmFJb3VkLTJjamxsRE9DTGQxVGVIQ1YuYkQtREJwVlp0RlhUMXYzTndVcFUxYkJELXRINl9jRUtULVRqTk1Qc1JuZmJJXzRzMHJFZERKN3R3andLT3p4ZGozS3JxbV9tRGRSckg4ejJrUGtEdncuc2MzIiwiYXpwIjoiZGNyLlZaT1JCbDJNZmk4Tm5vS2lFWTZ6c0Y2bENpaHg2Nkg0UENRUmVnIn0.KLVgCS9gR_Nv_qykgIky-QU0ynw9Eg0y2Xhba71NJBeJJyH3WoR0v9cxflQAc_70jDS14rUiCulZ24iq_ZaVxfR3GtXQodxHkKa6wT6PwzHynQdDiMPTyUk3bPW7x4hkr3Q-xKCh6cl9O9WDcnWCCbR-ZqazfFBBPYUdDxC9WOAcavGTTdJFw-ID_w_EReHI1_E7OYxoKo45cpcMLb2uxxb2ym3vGqaRBUnHvcdYeWN3QDcMQxf5ugt2-8AJr7UWBWt8J5x-4qnzHLkBoqvBbXaOAnhIgIu27NQS-8TG8X9aE146nlLN1-MOanozG3ytTHm46e_X4d0-YcSHsS1ptA";

// Helper to create a fresh client + transport for each request (simple approach).
async function createClient() {
  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    },
  });

  const client = new Client({
    name: "hono-tester",
    version: "1.0.0",
  });

  // Add connection / ping timeout of 10 seconds, 5 seconds respectively
  await Promise.race([
    client.connect(transport),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), 10_000)
    ),
  ]);

  await Promise.race([
    client.ping(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Ping timeout")), 5_000)
    ),
  ]);

  return { client, transport };
}

// Pagination helpers (copied / simplified from the main client code)
async function fetchTools(client: Client): Promise<Tool[]> {
  let all: Tool[] = [];
  let res: ListToolsResult = { tools: [] } as any;
  do {
    res = await client.listTools({ cursor: res.nextCursor });
    all = all.concat(res.tools);
  } while (res.nextCursor);
  return all;
}

async function fetchResources(client: Client): Promise<Resource[]> {
  let all: Resource[] = [];
  let res: ListResourcesResult = { resources: [] } as any;
  do {
    res = await client.listResources({ cursor: res.nextCursor });
    all = all.concat(res.resources);
  } while (res.nextCursor);
  return all;
}

async function fetchPrompts(client: Client): Promise<Prompt[]> {
  let all: Prompt[] = [];
  let res: ListPromptsResult = { prompts: [] } as any;
  do {
    res = await client.listPrompts({ cursor: res.nextCursor });
    all = all.concat(res.prompts);
  } while (res.nextCursor);
  return all;
}

async function fetchResourceTemplates(client: Client): Promise<ResourceTemplate[]> {
  let all: ResourceTemplate[] = [];
  let res: ListResourceTemplatesResult = { resourceTemplates: [] } as any;
  do {
    res = await client.listResourceTemplates({ cursor: res.nextCursor });
    all = all.concat(res.resourceTemplates);
  } while (res.nextCursor);
  return all;
}

// Create the Hono app.
const app = new Hono();

app.get("/ping", async (c) => {
  try {
    const { client, transport } = await createClient();
    const caps = await client.getServerCapabilities();
    await client.close();
    await transport.close();
    return c.json({ ok: true, capabilities: caps });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 500);
  }
});

app.get("/tools", async (c) => {
  try {
    const { client, transport } = await createClient();
    const tools = await fetchTools(client);
    await client.close();
    await transport.close();
    return c.json({ ok: true, tools });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 500);
  }
});

app.get("/resources", async (c) => {
  try {
    const { client, transport } = await createClient();
    const resources = await fetchResources(client);
    await client.close();
    await transport.close();
    return c.json({ ok: true, resources });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 500);
  }
});

app.get("/resource/:name", async (c) => {
  const name = c.req.param("name");
  try {
    const { client, transport } = await createClient();
    const resources = await fetchResources(client);
    const resource = resources.find((r) => r.name === name);
    if (!resource) {
      await client.close();
      await transport.close();
      return c.json({ ok: false, error: "Resource not found" }, 404);
    }
    const data = await client.readResource({ uri: resource.uri });
    await client.close();
    await transport.close();
    return c.json({ ok: true, resource: data });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 500);
  }
});

app.get("/prompts", async (c) => {
  try {
    const { client, transport } = await createClient();
    const prompts = await fetchPrompts(client);
    await client.close();
    await transport.close();
    return c.json({ ok: true, prompts });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 500);
  }
});

app.get("/resource-templates", async (c) => {
  try {
    const { client, transport } = await createClient();
    const templates = await fetchResourceTemplates(client);
    await client.close();
    await transport.close();
    return c.json({ ok: true, resourceTemplates: templates });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 500);
  }
});

// Start the server only if this module is executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  console.log(`[MCP Hono Tester] Running on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app; 