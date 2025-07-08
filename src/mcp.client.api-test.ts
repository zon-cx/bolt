import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createActor } from "xstate";
import mcpClientMachine from "./mcp.client";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Resource } from "@modelcontextprotocol/sdk/types.js";

const testLocalRouter = true;
const MCP_URL = testLocalRouter ? new URL("http://localhost:8080/mcp/4db27887f15847f9be1ccf92334dfbb3") : new URL("https://registry.cfapps.eu12.hana.ondemand.com/mcp/4db27887f15847f9be1ccf92334dfbb3");

// Connect to local router instead of remote registry
  const AUTH_TOKEN =
  "eyJ0eXAiOiJhdCtKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik9FVkJNVU0xUkVWQ1JEQXpPVEZGTlRJNE0wSXhRemN6UXpJM056UkRORFkzT0VORVF6Y3dNQSIsImN0eF9tb2RlIjoibG9naW4ifQ.eyJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiaWF0IjoxNzQ4MTIzMjI2LCJleHAiOjE3Nzk2NTkyMjYsImNsaWVudF9pZCI6ImRjci5WWk9SQmwyTWZpOE5ub0tpRVk2enNGNmxDaWh4NjZINFBDUVJlZyIsImF1ZCI6ImRjci5WWk9SQmwyTWZpOE5ub0tpRVk2enNGNmxDaWh4NjZINFBDUVJlZyIsImlzcyI6Imh0dHBzOi8vZ2lneWEuYXV0aHouaWQvb2lkYy9vcC92MS4wLzRfeUNYdXZRNTJVeDUyQmRhUVR4VVZoZyIsInN1YiI6IjRkYjI3ODg3ZjE1ODQ3ZjliZTFjY2Y5MjMzNGRmYmIzIiwic2lkIjoiMzAzMjc0NzQwMjI2X0xnSVZvTWxmV24tTlFLT1kzajBLV3ZkeHhwMCIsImp0aSI6InN0Mi5zLkF0THR0Tkx0MmcuYl9QZkZzT1YwVFctQzlfSG80OXRPVFcwcF9uWHItYWtnQVJXeEoxdk9kMDhHa3ZpU3J1RVJqU0tncDltNTdsbXk4MHN5eHBNT0ZhaGlVZFNoa3JUd0d1Wjl3MC0yVUVFVUVVc2s0bDlNSmFJb3VkLTJjamxsRE9DTGQxVGVIQ1YuYkQtREJwVlp0RlhUMXYzTndVcFUxYkJELXRINl9jRUtULVRqTk1Qc1JuZmJJXzRzMHJFZERKN3R3andLT3p4ZGozS3JxbV9tRGRSckg4ejJrUGtEdncuc2MzIiwiYXpwIjoiZGNyLlZaT1JCbDJNZmk4Tm5vS2lFWTZ6c0Y2bENpaHg2Nkg0UENRUmVnIn0.KLVgCS9gR_Nv_qykgIky-QU0ynw9Eg0y2Xhba71NJBeJJyH3WoR0v9cxflQAc_70jDS14rUiCulZ24iq_ZaVxfR3GtXQodxHkKa6wT6PwzHynQdDiMPTyUk3bPW7x4hkr3Q-xKCh6cl9O9WDcnWCCbR-ZqazfFBBPYUdDxC9WOAcavGTTdJFw-ID_w_EReHI1_E7OYxoKo45cpcMLb2uxxb2ym3vGqaRBUnHvcdYeWN3QDcMQxf5ugt2-8AJr7UWBWt8J5x-4qnzHLkBoqvBbXaOAnhIgIu27NQS-8TG8X9aE146nlLN1-MOanozG3ytTHm46e_X4d0-YcSHsS1ptA";

const authInfo: AuthInfo = {
  scopes: ["openid", "profile", "email"],
  token: AUTH_TOKEN,
  clientId: "dcr.VZORBl2Mfi8NnoKiEY6zsF6lCihx66H4PCQReg",
};

// Interpret the XState machine (single long-lived actor for all requests).
const actor = createActor(mcpClientMachine, {
  input: {
    url: MCP_URL,
    options: {
      info: { name: "router-test-client", version: "1.0.0" },
      auth: authInfo,
      session: "test",
    },
  },
});

let latestState = actor.getSnapshot();
actor.subscribe((state) => {
  latestState = state;
  // Log state transitions for debug
  console.log(`[MCP-XState]`, state.value, state.context.error?.message ?? "");
});

actor.start();

// Utility to wait for a predicate on latestState with timeout.
function waitFor<T>(predicate: () => T | undefined, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const started = Date.now();
    const handle = setInterval(() => {
      const res = predicate();
      if (res !== undefined) {
        clearInterval(handle);
        resolve(res);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(handle);
        reject(new Error("Timeout"));
      }
    }, 100);
  });
}

const app = new Hono();

app.get("/state", (c) => {
  return c.json({
    value: latestState.value,
    error: latestState.context.error,
    retries: latestState.context.retries,
  });
});

app.get("/tools", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ tools: snapshot.context.tools ?? [] });
});

app.get("/resources", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ resources: snapshot.context.resources ?? [] });
});

app.get("/resource-data/:name", (c) => {
  const name = c.req.param("name");
  const snapshot = actor.getSnapshot();
  const data = snapshot.context.resourceData?.[name];
  if (!data) {
    return c.json({ ok: false, error: "No data for resource" }, 404);
  }
  return c.json({ ok: true, data });
});

// Endpoint to trigger reading a resource by name using the actor.
app.post("/read-resource/:name", async (c) => {
  const name = c.req.param("name");
  const resource: Resource | undefined = latestState.context.resources?.find(
    (r) => r.name === name
  );
  if (!resource) {
    return c.json({ ok: false, error: "Resource not found in current list" }, 404);
  }

  actor.send({
    type: "@updates.resource",
    ...resource,
  } as any);

  try {
    const data = await waitFor(() => latestState.context.resourceData?.[name], 8000);
    return c.json({ ok: true, data });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || String(e) }, 504);
  }
});

// Get resource templates
app.get("/resource-templates", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ resourceTemplates: snapshot.context.resourceTemplates ?? [] });
});

// Get prompts
app.get("/prompts", (c) => {
  const snapshot = actor.getSnapshot();
  return c.json({ prompts: snapshot.context.prompts ?? [] });
});

// Test completion endpoint
app.post("/test-complete", async (c) => {
  try {
    const body = await c.req.json();
    const { ref, argument } = body;
    
    const snapshot = actor.getSnapshot();
    if (!snapshot.matches("ready") || !snapshot.context.client) {
      return c.json({ ok: false, error: "Client not ready" }, 503);
    }
    
    const client = snapshot.context.client;
    const result = await client.complete({ ref, argument });
    
    return c.json({ ok: true, result });
  } catch (error: any) {
    return c.json({ 
      ok: false, 
      error: error.message || "Completion failed" 
    }, 500);
  }
});

// Call tool endpoint
app.post("/call-tool", async (c) => {
  try {
    const body = await c.req.json();
    const { name, arguments: args } = body;
    
    const snapshot = actor.getSnapshot();
    if (!snapshot.matches("ready") || !snapshot.context.client) {
      return c.json({ ok: false, error: "Client not ready" }, 503);
    }
    
    const client = snapshot.context.client;
    const result = await client.callTool({ name, arguments: args });
    
    return c.json({ ok: true, result });
  } catch (error: any) {
    return c.json({ 
      ok: false, 
      error: error.message || "Tool call failed" 
    }, 500);
  }
});

// Restart/Retry endpoint
app.post("/retry", (_c) => {
  actor.send({ type: "retry" });
  return _c.json({ ok: true });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8788);
  console.log(`[MCP XState Hono] Running on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app; 