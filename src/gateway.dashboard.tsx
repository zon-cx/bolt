/** @jsxImportSource hono/jsx */

/**
 * MCP Server Implementation
 * Exposes an MCP server that proxies requests to connected MCP clients
 */
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createAtom, type Atom } from "@xstate/store";
import { Hono } from "hono";
import { html } from "hono/html";
import { jsxRenderer } from "hono/jsx-renderer";
import { stream, streamSSE, streamText } from "hono/streaming";
import { nanoid } from "nanoid";
import {
  createMcpAgent,
  getOrCreateMcpAgent,
  listAgents,
} from "./gateway.mcp.connection.store.ts";
import { serve } from "@hono/node-server";
import { createServer } from "node:https";

import { env } from "process";
import { gigyaOAuthProvider, requireAuth } from "./gateway.mcp.auth";
import { StatusCode } from "hono/utils/http-status";
import { InMemoryOAuthClientProvider } from "./mcp.auth.client.ts";
import { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { MCPClientConnection } from "./gateway.mcp.client.ts";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connectYjs } from "./store.yjs.ts";
import { randomUUID } from "crypto";
import { jwtDecode } from "jwt-decode";
import { createMiddleware } from "hono/factory";
import {
  getCookie,
  getSignedCookie,
  setCookie,
  setSignedCookie,
  deleteCookie,
} from "hono/cookie";
import { readFileSync } from "fs";

type Variables = {
  connection: MCPClientConnection;
  oauthProvider: InMemoryOAuthClientProvider;
  agentId: string;
  agent: {
    id: string;
    name: string;
    email: string;
    access_token: string;
  };
};

const app = new Hono<{ Variables: Variables }>();

// Unwrap Hono errors to see original error details
app.onError((err, c) => {
  console.error("Hono error:", err);
  return c.json(
    {
      error: String(err),
      stack: err.stack,
    },
    500
  );
});

// Login page
app.get("/login", async (c) => {
  // Check if user is already authenticated

  // If authentication fails, show login page
  return c.html(
    <html>
      <head>
        <title>Login - MCP Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      </head>
      <body class="bg-gray-50">
        <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div class="max-w-md w-full space-y-8">
            <div>
              <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Welcome to MCP Dashboard
              </h2>
              <p class="mt-2 text-center text-sm text-gray-600">
                Sign in to manage your MCP agents and connections
              </p>
            </div>
            <div class="mt-8 space-y-6">
              <div class="rounded-md shadow-sm -space-y-px">
                <a
                  href="/agents/me"
                  class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <span class="absolute left-0 inset-y-0 flex items-center pl-3">
                    <svg
                      class="h-5 w-5 text-indigo-500 group-hover:text-indigo-400"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </span>
                  Sign in with OAuth
                </a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
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
              {agents.map((agent) => (
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
    </html>
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
        {agents.map((agent) => (
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
  );
});

const COOKIE_SECRET = env.COOKIE_SECRET || "secret";



app.get("/oauth/callback", async function (c) {
  const url = new URL(c.req.url);
  const state = c.req.query("state")!;
  const authCode = c.req.query("code")!;
  const oauthProvider = InMemoryOAuthClientProvider.fromState(state);
  const transport = new StreamableHTTPClientTransport(
    new URL(env.MCP_MANAGER_URL!),
    {
      authProvider: oauthProvider,
    }
  );
  await transport.finishAuth(authCode);
  if (oauthProvider.tokens()) {
    const { access_token } = oauthProvider.tokens()!;
    const { sub, email, nickname, name } = jwtDecode(access_token) as {
      sub: string;
      email: string;
      nickname: string;
      name: string;
    }; 
    const connection = new MCPClientConnection(new URL(env.MCP_MANAGER_URL!), {
      id: oauthProvider.id,
      info: {
        name: nickname || name || sub!,
        version: "1.0.0",
      },
      client: {
        capabilities: {},
      },
      transport: () => transport,
    });
    await connection.init();
    connections.set(sub!, connection);

    await setCookie(c, "mcp-agent-id", sub!, {
      httpOnly: true,
      secure: c.req.url.startsWith("https://"),
      sameSite: "none",
      domain: ".local.pyzlo.in",
      maxAge: 60 * 60 * 24 * 30,
    });

    await setCookie(c, "oauth-id", oauthProvider.id, {
      httpOnly: true,
      secure: c.req.url.startsWith("https://"),
      sameSite: "none",
      domain: ".local.pyzlo.in",
      maxAge: 60 * 60 * 24 * 30,
    });

    const targetUrl =
      (await oauthProvider.get("original-url")) || `/agents/${sub}`;
    console.log("redirecting to", `${targetUrl}`);
    return c.redirect(`${targetUrl}`, 302);
  }
});

const connections = new Map<string, MCPClientConnection>();

const agentMiddleware = createMiddleware(async (c, next) => {
  const agentId =c.req.param("id") || c.var.agent?.id;
  c.set("agentId", agentId);

  console.log("agentId", agentId);
  const connection =
  agentId && connections.get(agentId)?.connectionState.get() === "ready"
      ? connections.get(agentId)!
      : new MCPClientConnection(new URL(env.MCP_MANAGER_URL!), {
          id: agentId,
          info: {
            name: c.var.agent?.name || "me",
            version: "1.0.0",
          },
          client: {
            capabilities: {},
          },
          transport: () =>
            new StreamableHTTPClientTransport(agentId ? new URL(`${env.MCP_MANAGER_URL}/${agentId}`) : new URL(env.MCP_MANAGER_URL!), {
              authProvider: c.get("oauthProvider")!,
            }),
        });
  await connection.init();
  if (connection.connectionState.get() == "authenticating") {
    return c.redirect(
      c.get("oauthProvider").authorizationUrl?.get()!.toString(),
      302
    );
  }

  agentId && connections.set(agentId, connection);
  c.set("connection", connection);

  await next();
});

const oauthMiddleware = createMiddleware(async (c, next) => {
  const oauthId = await getCookie(c, "oauth-id");
  const redirectUri = new URL(c.req.url).origin + "/oauth/callback";
  console.log("redirect-url", redirectUri);

  const oauthProvider = new InMemoryOAuthClientProvider(
    redirectUri,
    {
      client_name: "Dashboard MCP Client",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid profile email agent",
    },
    oauthId
  );

  oauthProvider.save("original-url", c.req.url);
  c.set("oauthProvider", oauthProvider);

  await setCookie(c, "oauth-id", oauthProvider.id, {
    httpOnly: true,
    secure: c.req.url.startsWith("https://"),
    sameSite: "none",
    domain: ".local.pyzlo.in",
    maxAge: 60 * 60 * 24 * 30,
  });

  const info = await oauthProvider.info();
  console.log("info", info);
  c.set("agent",info);

  await next();
});

app.get("/agents/me", oauthMiddleware, agentMiddleware, async (c) => {
  return c.redirect(`/agents/${c.var.agent.id}`);
});
// Agent-specific endpoints
app.get("/agents/:id", oauthMiddleware, agentMiddleware, async (c) => {
  const connection = c.var.connection;
  const agentId = c.var.agent?.id;
  const agentName = c.var.agent?.name;
  if (connection.connectionState.get() != "ready") {
    return c.html(
      <html>
        <body>
          <h1>Connecting...</h1>
        </body>
      </html>
    );
  }
  const listConnections = await connection.client.callTool({
    name: "list-connections",
    arguments: {},
  });
  const servers = listConnections.structuredContent?.connections;

  if (!listConnections || listConnections.isError) {
    throw new Error(
      `Failed to list connections: ${
        listConnections?.content.map((e) => e.text) || "Unknown error"
      }`
    );
  }

  return c.html(
    <html>
      <head>
        <title>MCP Agent: {agentName || agentId}</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      </head>
      <body>
        <div class="p-6 max-w-xl mx-auto">
          <h1 class="text-2xl font-bold mb-4">
            MCP Agent{agentName ? `: ${agentName}` : ""}
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
            {servers.length === 0 ? (
              <p class="text-gray-500">No servers connected</p>
            ) : (
              <ul class="divide-y">
                {servers.map((server) => (
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
            <div
              id="tools-list"
              hx-get={`/agents/${agentId}/tools`}
              hx-trigger="load"
            >
              Loading tools...
            </div>
          </div>
        </div>
      </body>
    </html>
  );
});

// Connect to a new MCP server
app.post("/agents/:id/connect", oauthMiddleware, agentMiddleware, async (c) => {
  const connection = c.var.connection;
  const agentId = c.var.connection?.id;
  const agentName = c.var.connection?.name;
  const formData = await c.req.formData();
  const url = formData.get("url")?.toString();
  const id = formData.get("id")?.toString();
  const response = await connection.client.callTool({
    name: "connect",
    arguments: {
      url,
      name: id,
      id,
    },
  });
  if (response.isError) {
    return c.render(
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>
          Failed to connect to MCP server:{" "}
          {String(response.content?.map((e) => e.text).join(`\n`))}
        </p>
      </div>
    );
  }
  const listConnections = await connection.client.callTool({
    name: "list-connections",
    arguments: {},
  });
  const servers = listConnections.structuredContent?.connections;

  return c.html(
    <div id="servers-list">
      <h2 class="text-xl font-semibold mb-2">Connected Servers</h2>
      {servers.length === 0 ? (
        <p class="text-gray-500">No servers connected</p>
      ) : (
        <ul class="divide-y">
          {servers.map((server) => (
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
  );
});

// Disconnect from an MCP server
app.delete("/agents/:id/server/:server", async (c) => {
  const agentId = c.req.param("id");
  const serverId = c.req.param("server");
  const agent = getOrCreateMcpAgent(agentId);

  try {
    await agent.closeConnection(serverId);

    // Get updated list of servers
    const servers = Object.keys(agent.mcpConnections).map((id) => {
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
        {servers.length === 0 ? (
          <p class="text-gray-500">No servers connected</p>
        ) : (
          <ul class="divide-y">
            {servers.map((server) => (
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
    );
  } catch (error) {
    console.error(`Error disconnecting from MCP server:`, error);
    return c.html(
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Failed to disconnect from MCP server: {String(error)}</p>
      </div>
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

    await stream.writeln(await html`<ul class="divide-y"></ul>`);

    agent.tools.subscribe(() => {
      streamTools(agent.listTools());
    });

    await streamTools(agent.listTools());

    if (agent.tools.get().length === 0) {
      await stream.writeln(
        await html`<p className="text-gray-500">Still loading tools...</p>`
      );
    }
    async function streamTools(tools: Tool[]) {
      for (const tool of tools) {
        const { source } = tool;
        if (!returned[tool.name]) {
          await stream.writeln(
            await html`<li class="py-2">
              <div class="font-medium">${tool.name}</div>
              <div class="text-sm text-gray-500">${tool.description}</div>
              <div class="text-xs text-gray-400">
                Server: ${source?.server} (${source?.name})
              </div>
            </li>`
          );
          returned[tool.name] = true;
        }
      }
    }
    await stream.sleep(100);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await stream.writeln(await html`</ul>`);
  })
);

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
              This is an MCP server that proxies requests to connected MCP
              clients.
            </p>
            <p class="mb-4">
              The MCP endpoint is available at:{" "}
              <code class="bg-gray-100 px-2 py-1 rounded">/mcp</code>
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
              <li>
                Use the MCP endpoint to interact with all connected servers
              </li>
            </ol>
          </div>
        </div>
      </body>
    </html>
  );
});


const https = process.env.KEY_PATH && process.env.CERT_PATH ? {
  createServer: createServer,
  serverOptions: {
    key: readFileSync(env.KEY_PATH!),
    cert: readFileSync(env.CERT_PATH!),
  },
} : {};
// Export the fetch handler for HTTP vals
export default async function handler(req: Request) {
  console.log(`Received request: ${req.method} ${new URL(req.url).pathname}`);
  return app.fetch(req);
}
serve(
  {
    fetch: app.fetch,
    // createServer,
    port: env.PORT ? parseInt(env.PORT) : 8080,
    hostname: "0.0.0.0",
    ...https,
  },
  (server) => {
    console.log(`Server is running on https://local.pyzlo.in:${server.port}`);
  }
);
