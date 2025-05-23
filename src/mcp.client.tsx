/** @jsxImportSource hono/jsx */

/**
 * MCP Server Implementation
 * Exposes an MCP server that proxies requests to connected MCP clients
 */
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Atom } from "@xstate/store";
import { Hono } from "hono";
import { html } from "hono/html";
import { jsxRenderer } from "hono/jsx-renderer";
import { stream, streamSSE, streamText } from "hono/streaming";
import { nanoid } from "nanoid";
import { createMcpAgent, getOrCreateMcpAgent, listAgents } from "./mcp.agent.ts";
import { serve } from "@hono/node-server";
import { env } from "process";
import { createServer } from 'node:http2'

const app = new Hono();
// Unwrap Hono errors to see original error details
app.onError((err, c) => {
  console.error("Hono error:", err);
  return c.json({
    error: String(err),
    stack: err.stack,
  }, 500);
});

 
// Agent management endpoints
app.get("/agents", async (c) => {
  const agents = listAgents();
  return c.html(
    <html>
      <head>
        <title>MCP Agents</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      </head>
      <body>
        <div class="p-6 max-w-xl mx-auto">
          <h1 class="text-2xl font-bold mb-4">MCP Agents</h1>

          <div class="mb-6">
            <h2 class="text-xl font-semibold mb-2">Create New Agent</h2>
            <form
              hx-post="/agents/create"
              hx-target="#agents-list"
              hx-swap="outerHTML"
            >
              <input
                name="name"
                type="text"
                placeholder="Agent Name"
                class="w-full p-2 border rounded mb-2"
                required
              />
              <button
                type="submit"
                class="bg-blue-500 text-white px-4 py-2 rounded"
              >
                Create Agent
              </button>
            </form>
          </div>

          <div id="agents-list">
            <h2 class="text-xl font-semibold mb-2">Existing Agents</h2>
            <ul class="divide-y">
              {agents.map(agent => (
                <li class="py-2">
                  <a
                    href={`/agents/${agent.id}`}
                    class="text-blue-500 hover:underline"
                  >
                    {agent.name} ({agent.id})
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </body>
    </html>,
  );
});

app.post("/agents/create", async (c) => {
  const formData = await c.req.formData();
  const name = formData.get("name")?.toString() || "New Agent";

  const server = await createMcpAgent(name);

  const agents = listAgents();
  return c.html(
    <div id="agents-list">
      <h2 class="text-xl font-semibold mb-2">Existing Agents</h2>
      <ul class="divide-y">
        {agents.map(agent => (
          <li class="py-2">
            <a
              href={`/agents/${agent.id}`}
              class="text-blue-500 hover:underline"
            >
              {agent.name} ({agent.id})
            </a>
          </li>
        ))}
      </ul>
    </div>,
  );
});

// Agent-specific endpoints
app.get("/agents/:id", async (c) => {
  const agentId = c.req.param("id");
  const agent = getOrCreateMcpAgent(agentId);

  // Get connected servers for this agent
  const servers = Object.keys(agent.mcpConnections).map(id => {
    const connection = agent.mcpConnections[id];
    return {
      id,
      url: connection.url.toString(),
      name: agent._name,
      version: agent._version,
    };
  });

  return c.html(
    <html>
      <head>
        <title>MCP Agent: {agent.agentName}</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      </head>
      <body>
        <div class="p-6 max-w-xl mx-auto">
          <h1 class="text-2xl font-bold mb-4">
            MCP Agent: {agent.agentName}
            <span class="text-sm text-gray-500 ml-2">({agentId})</span>
          </h1>

          <div class="mb-6">
            <h2 class="text-xl font-semibold mb-2">Connect to MCP Server</h2>
            <form
              hx-post={`/agents/${agentId}/connect`}
              hx-target="#servers-list"
              hx-swap="outerHTML"
            >
              <input
                name="url"
                type="text"
                placeholder="MCP Server URL"
                class="w-full p-2 border rounded mb-2"
                value="https://store-mcp.val.run/mcp"
                required
              />
              <input
                name="id"
                type="text"
                placeholder="Server ID (optional)"
                class="w-full p-2 border rounded mb-2"
                value="store"
              />
              <button
                type="submit"
                class="bg-blue-500 text-white px-4 py-2 rounded"
              >
                Connect
              </button>
            </form>
          </div>

          <div id="servers-list">
            <h2 class="text-xl font-semibold mb-2">Connected Servers</h2>
            {servers.length === 0 ? <p class="text-gray-500">No servers connected</p> : (
              <ul class="divide-y">
                {servers.map(server => (
                  <li class="py-2 flex justify-between items-center">
                    <div>
                      <div class="font-medium">{server.id}</div>
                      <div class="text-sm text-gray-500">{server.url}</div>
                    </div>
                    <button
                      class="bg-red-500 text-white px-3 py-1 rounded text-sm"
                      hx-delete={`/agents/${agentId}/server/${server.id}`}
                      hx-target="#servers-list"
                      hx-swap="outerHTML"
                    >
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div class="mt-6">
            <h2 class="text-xl font-semibold mb-2">Available Tools</h2>
            <div id="tools-list" hx-get={`/agents/${agentId}/tools`} hx-trigger="load">
              Loading tools...
            </div>
          </div>
        </div>
      </body>
    </html>,
  );
});

// Connect to a new MCP server
app.post("/agents/:id/connect", async (c) => {
  const agentId = c.req.param("id");
  const agent = getOrCreateMcpAgent(agentId);
  const formData = await c.req.formData();
  const url = formData.get("url")?.toString();
  const id = formData.get("id")?.toString();

  if (!url) {
    return c.text("URL is required", 400);
  }

  try {
    await agent.connect(url, { id });

    // Get updated list of servers
    const servers = Object.keys(agent.mcpConnections).map(id => {
      const connection = agent.mcpConnections[id];
      return {
        id,
        url: connection.url.toString(),
        name: agent._name,
        version: agent._version,
      };
    });

    return c.html(
      <div id="servers-list">
        <h2 class="text-xl font-semibold mb-2">Connected Servers</h2>
        {servers.length === 0 ? <p class="text-gray-500">No servers connected</p> : (
          <ul class="divide-y">
            {servers.map(server => (
              <li class="py-2 flex justify-between items-center">
                <div>
                  <div class="font-medium">{server.id}</div>
                  <div class="text-sm text-gray-500">{server.url}</div>
                </div>
                <button
                  class="bg-red-500 text-white px-3 py-1 rounded text-sm"
                  hx-delete={`/agents/${agentId}/server/${server.id}`}
                  hx-target="#servers-list"
                  hx-swap="outerHTML"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>,
    );
  } catch (error) {
    console.error(`Error connecting to MCP server:`, error);
    return c.html(
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Failed to connect to MCP server: {String(error)}</p>
      </div>,
    );
  }
});

// Disconnect from an MCP server
app.delete("/agents/:id/server/:server", async (c) => {
  const agentId = c.req.param("id");
  const serverId = c.req.param("server");
  const agent = getOrCreateMcpAgent(agentId);

  try {
    await agent.closeConnection(serverId);

    // Get updated list of servers
    const servers = Object.keys(agent.mcpConnections).map(id => {
      const connection = agent.mcpConnections[id];
      return {
        id,
        url: connection.url.toString(),
        name: agent._name,
        version: agent._version,
      };
    });

    return c.html(
      <div id="servers-list">
        <h2 class="text-xl font-semibold mb-2">Connected Servers</h2>
        {servers.length === 0 ? <p class="text-gray-500">No servers connected</p> : (
          <ul class="divide-y">
            {servers.map(server => (
              <li class="py-2 flex justify-between items-center">
                <div>
                  <div class="font-medium">{server.id}</div>
                  <div class="text-sm text-gray-500">{server.url}</div>
                </div>
                <button
                  class="bg-red-500 text-white px-3 py-1 rounded text-sm"
                  hx-delete={`/agents/${agentId}/server/${server.id}`}
                  hx-target="#servers-list"
                  hx-swap="outerHTML"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>,
    );
  } catch (error) {
    console.error(`Error disconnecting from MCP server:`, error);
    return c.html(
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Failed to disconnect from MCP server: {String(error)}</p>
      </div>,
    );
  }
});

// List tools for an agent
app.get("/agents/:id/tools", async (c) =>
  streamText(c, async (stream) => {
    const agentId = c.req.param("id");
    const agent = getOrCreateMcpAgent(agentId);
    // // Wait 1 second.
    // await stream.sleep(1000);
    const returned = {} as Record<string, boolean>;

    await stream.writeln(await html`<ul class="divide-y">`);

    agent.tools.subscribe(() => {
      streamTools(agent.listTools());
    });

    await streamTools(agent.listTools());

    if (agent.tools.get().length === 0) {
       await stream.writeln(
        await html`<p className="text-gray-500">Still loading tools...</p>`,
      );
    }
    async function streamTools(tools: Tool[]) {
      for (const tool of tools) {
        const { source } = tool;
        if (!returned[tool.name]) {
          await stream.writeln(await html`<li class="py-2">
            <div class="font-medium">${tool.name}</div>
            <div class="text-sm text-gray-500">${tool.description}</div>
            <div class="text-xs text-gray-400">Server: ${source?.server} (${source?.name})</div>
          </li>`);
          returned[tool.name] = true;
        }
      }
    }
    await stream.sleep(100);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await stream.writeln(
      await html`</ul>`,
    );
  }));

// Simple landing page
app.get("/", (c) => {
  return c.html(
    <html>
      <head>
        <title>MCP Server</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
      </head>
      <body>
        <div class="p-6 max-w-xl mx-auto">
          <h1 class="text-2xl font-bold mb-4">MCP Server</h1>

          <div class="mb-6">
            <p class="mb-2">
              This is an MCP server that proxies requests to connected MCP clients.
            </p>
            <p class="mb-4">
              The MCP endpoint is available at: <code class="bg-gray-100 px-2 py-1 rounded">/mcp</code>
            </p>

            <div class="flex space-x-4">
              <a
                href="/agents"
                class="bg-blue-500 text-white px-4 py-2 rounded inline-block"
              >
                Manage Agents
              </a>
            </div>
          </div>

          <div class="border-t pt-4 mt-4">
            <h2 class="text-xl font-semibold mb-2">Usage</h2>
            <ol class="list-decimal pl-5 space-y-2">
              <li>Create or select an agent</li>
              <li>Connect the agent to one or more MCP servers</li>
              <li>Use the MCP endpoint to interact with all connected servers</li>
            </ol>
          </div>
        </div>
      </body>
    </html>,
  );
});

// Export the fetch handler for HTTP vals
export default async function handler(req: Request) {
  console.log(`Received request: ${req.method} ${new URL(req.url).pathname}`);
  return app.fetch(req);
}
serve({
  fetch: app.fetch,
  createServer,
  port: parseInt(env.PORT || "8080", 10),
});