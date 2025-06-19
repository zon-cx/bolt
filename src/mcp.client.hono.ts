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

// Test against our local router instead of remote registry
const MCP_URL = new URL("http://localhost:8080/mcp");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "test-token";

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

app.post("/call-tool/:name", async (c) => {
  const name = c.req.param("name");
  const args = await c.req.json();
  try {
    const { client, transport } = await createClient();
    const result = await client.callTool({ name, arguments: args });
    await client.close();
    await transport.close();
    return c.json({ ok: true, result });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 500);
  }
});

app.post("/complete", async (c) => {
  const body = await c.req.json();
  try {
    const { client, transport } = await createClient();
    const result = await client.complete(body);
    await client.close();
    await transport.close();
    return c.json({ ok: true, result });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 500);
  }
});

// Start the server only if this module is executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  console.log(`[MCP Hono Tester] Running on http://localhost:${port}`);
  console.log(`[MCP Hono Tester] Testing against: ${MCP_URL}`);
  serve({ fetch: app.fetch, port });
}

export default app; 