import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createActor } from "xstate";
import { Map as YMap } from "yjs";
import clientManagerMachine, { type ServerConfig, NamespacedDataStore } from "./registry.mcp.client.xstate.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import * as dotenv from "dotenv";
import { connectYjs } from "./store.yjs.js";

dotenv.config();

const AUTH_TOKEN =
  "eyJ0eXAiOiJhdCtKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik9FVkJNVU0xUkVWQ1JEQXpPVEZGTlRJNE0wSXhRemN6UXpJM056UkRORFkzT0VORVF6Y3dNQSIsImN0eF9tb2RlIjoibG9naW4ifQ.eyJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiaWF0IjoxNzQ4MTIzMjI2LCJleHAiOjE3Nzk2NTkyMjYsImNsaWVudF9pZCI6ImRjci5WWk9SQmwyTWZpOE5ub0tpRVk2enNGNmxDaWh4NjZINFBDUVJlZyIsImF1ZCI6ImRjci5WWk9SQmwyTWZpOE5ub0tpRVk2enNGNmxDaWh4NjZINFBDUVJlZyIsImlzcyI6Imh0dHBzOi8vZ2lneWEuYXV0aHouaWQvb2lkYy9vcC92MS4wLzRfeUNYdXZRNTJVeDUyQmRhUVR4VVZoZyIsInN1YiI6IjRkYjI3ODg3ZjE1ODQ3ZjliZTFjY2Y5MjMzNGRmYmIzIiwic2lkIjoiMzAzMjc0NzQwMjI2X0xnSVZvTWxmV24tTlFLT1kzajBLV3ZkeHhwMCIsImp0aSI6InN0Mi5zLkF0THR0Tkx0MmcuYl9QZkZzT1YwVFctQzlfSG80OXRPVFcwcF9uWHItYWtnQVJXeEoxdk9kMDhHa3ZpU3J1RVJqU0tncDltNTdsbXk4MHN5eHBNT0ZhaGlVZFNoa3JUd0d1Wjl3MC0yVUVFVUVVc2s0bDlNSmFJb3VkLTJjamxsRE9DTGQxVGVIQ1YuYkQtREJwVlp0RlhUMXYzTndVcFUxYkJELXRINl9jRUtULVRqTk1Qc1JuZmJJXzRzMHJFZERKN3R3andLT3p4ZGozS3JxbV9tRGRSckg4ejJrUGtEdncuc2MzIiwiYXpwIjoiZGNyLlZaT1JCbDJNZmk4Tm5vS2lFWTZ6c0Y2bENpaHg2Nkg0UENRUmVnIn0.KLVgCS9gR_Nv_qykgIky-QU0ynw9Eg0y2Xhba71NJBeJJyH3WoR0v9cxflQAc_70jDS14rUiCulZ24iq_ZaVxfR3GtXQodxHkKa6wT6PwzHynQdDiMPTyUk3bPW7x4hkr3Q-xKCh6cl9O9WDcnWCCbR-ZqazfFBBPYUdDxC9WOAcavGTTdJFw-ID_w_EReHI1_E7OYxoKo45cpcMLb2uxxb2ym3vGqaRBUnHvcdYeWN3QDcMQxf5ugt2-8AJr7UWBWt8J5x-4qnzHLkBoqvBbXaOAnhIgIu27NQS-8TG8X9aE146nlLN1-MOanozG3ytTHm46e_X4d0-YcSHsS1ptA";

const authInfo: AuthInfo = {
  scopes: ["openid", "profile", "email"],
  token: AUTH_TOKEN,
  clientId: "dcr.VZORBl2Mfi8NnoKiEY6zsF6lCihx66H4PCQReg",
};

const id = "4db27887f15847f9be1ccf92334dfbb3";

// Initialize Yjs store
const doc = connectYjs("@mcp.registry");
const store = doc.getMap<ServerConfig>("@mcp.server");

// Create data store for namespaced data
const dataStore = new NamespacedDataStore();

// Create and start the client manager actor
const actor = createActor(clientManagerMachine, {
  id: id,
  input: {
    auth: authInfo,
    sessionId: id,
    store,
    dataStore
  }
});

actor.subscribe((s) => {
  console.log(`[manager] state`, s.value);
});

actor.start();

// Initialize Hono app
const app = new Hono();

app.get("/state", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ value: snapshot.value, error: snapshot.context.error });
});

app.get("/servers", (c) => {
  const snapshot = actor.getSnapshot();
  const list = Object.values(snapshot.context.mcpActors ?? {}).map((act: any) => {
    const snap = act.getSnapshot();
    return {
      id: act.id,
      value: snap.value,
      error: snap.context.error,
      status: act.status,
      name: snap.context?.options?.info?.name ?? act.id,
    };
  });
  return c.json(list);
});

app.get("/tools", (c) => {
  return c.json({ tools: dataStore.tools.get() });
});

app.get("/resources", (c) => {
  return c.json({ resources: dataStore.resources.get() });
});

app.get("/debug/actors", (c) => {
  const snapshot = actor.getSnapshot();
  const actors = Object.entries(snapshot.context.mcpActors ?? {}).map(([key, act]: [string, any]) => ({
    key,
    id: act.id,
    state: act.getSnapshot().value,
    tools: act.getSnapshot().context.tools?.length ?? 0
  }));
  return c.json(actors);
});

app.get("/server/:id/tools", (c) => {
  const id = c.req.param("id");
  const snapshot = actor.getSnapshot();
  const act: any = snapshot.context.mcpActors?.[id];
  if (!act) return c.json({ ok: false, error: "server not found" }, 404);
  const snap = act.getSnapshot();
  return c.json({ ok: true, tools: snap.context.tools ?? [] });
});

app.post("/connect", async (c) => {
  const body = await c.req.json<ServerConfig>();
  const id = body.id ?? body.url; // simple id
  store.set(id, body);
  actor.send({ type: "connect", ...body, id });
  return c.json({ ok: true });
});

app.post("/recalculate-tools", (c) => {
  // Tools are automatically recalculated when data store changes
  return c.json({ ok: true, message: "Tools are automatically updated" });
});

app.get("/namespaced/resources", (c) => {
  const snapshot = actor.getSnapshot();
  const res = Object.values(snapshot.context.mcpActors ?? {}).map((act: any) => {
    const snap = act.getSnapshot();
    return {
      id: act.id,
      value: snap.value,
      resources: snap.context.resources,
    };
  });
  return c.json(res);
});

// Tool call endpoint - using data store's callTool method
app.post("/call-tool", async (c) => {
  try {
    const body = await c.req.json<{ toolName: string; args?: any }>();
    const { toolName, args } = body;
    
    if (!toolName) {
      return c.json({ ok: false, error: "toolName is required" }, 400);
    }
    
    try {
      // Use the data store's callTool method directly
      const result = await dataStore.callTool(
        { name: toolName, arguments: args },
        {
          authInfo: authInfo,
          sendRequest: async () => ({} as any),
          sendNotification: async () => {},
          signal: new AbortController().signal,
          requestId: `test-${Date.now()}`,
          sessionId: id,
          _meta: {}
        }
      );
      
      return c.json({ 
        ok: true, 
        result,
        toolName
      });
    } catch (error) {
      return c.json({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Tool execution failed",
        toolName,
        availableTools: dataStore.tools.get().map((t: any) => t.name)
      }, 500);
    }
  } catch (error) {
    return c.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

// Read resource endpoint - using data store's readResource method
app.post("/read-resource", async (c) => {
  try {
    const body = await c.req.json<{ uri: string }>();
    const { uri } = body;
    
    if (!uri) {
      return c.json({ ok: false, error: "uri is required" }, 400);
    }
    
    try {
      const result = await dataStore.readResource(
        { uri },
        {
          authInfo: authInfo,
          sendRequest: async () => ({} as any),
          sendNotification: async () => {},
          signal: new AbortController().signal,
          requestId: `test-${Date.now()}`,
          sessionId: id,
          _meta: {}
        }
      );
      
      return c.json({ 
        ok: true, 
        result,
        uri
      });
    } catch (error) {
      return c.json({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Resource read failed",
        uri,
        availableResources: dataStore.resources.get().map((r: any) => r.uri)
      }, 500);
    }
  } catch (error) {
    return c.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

// Complete endpoint - using data store's complete method
app.post("/complete", async (c) => {
  try {
    const body = await c.req.json<{ ref: any; argument?: any }>();
    const { ref, argument } = body;
    
    if (!ref) {
      return c.json({ ok: false, error: "ref is required" }, 400);
    }
    
    try {
      const result = await dataStore.complete(
        { ref, argument },
        {
          authInfo: authInfo,
          sendRequest: async () => ({} as any),
          sendNotification: async () => {},
          signal: new AbortController().signal,
          requestId: `test-${Date.now()}`,
          sessionId: id,
          _meta: {}
        }
      );
      
      return c.json({ 
        ok: true, 
        result,
        ref
      });
    } catch (error) {
      return c.json({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Completion failed",
        ref
      }, 500);
    }
  } catch (error) {
    return c.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

// Test endpoint - list available tools with examples
app.get("/tool-examples", (c) => {
  const tools = dataStore.tools.get();
  
  const examples = tools.map((tool: any) => ({
    name: tool.name,
    description: tool.description,
    server: tool.source?.server,
    example: {
      toolName: tool.name,
      args: tool.inputSchema?.properties ? 
        Object.entries(tool.inputSchema.properties).reduce((acc, [key, schema]: [string, any]) => {
          // Generate example values based on schema type
          if (schema.type === "string") acc[key] = schema.example || "example-string";
          else if (schema.type === "number") acc[key] = schema.example || 123;
          else if (schema.type === "boolean") acc[key] = schema.example || true;
          else if (schema.type === "array") acc[key] = schema.example || [];
          else if (schema.type === "object") acc[key] = schema.example || {};
          return acc;
        }, {} as any) : undefined
    }
  }));
  
  return c.json(examples);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8789);
  console.log(`[ClientManager Hono] listening http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app; 