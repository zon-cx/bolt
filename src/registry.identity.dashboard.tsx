/** @jsxImportSource hono/jsx */

/**
 * MCP Server Implementation
 * Exposes an MCP server that proxies requests to connected MCP clients
 */
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { html } from "hono/html";
import { streamSSE, streamText } from "hono/streaming";
import {
  MCPAgentManager,
   serverConfig,
} from "./registry.identity.store.ts";
import { serve } from "@hono/node-server";
import { createServer } from "node:https";

import { env } from "process";
import { InMemoryOAuthClientProvider } from "./mcp.client.auth.ts";
import mcpClientMachine from "./mcp.client.ts";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { jwtDecode } from "jwt-decode";
import { createMiddleware } from "hono/factory";
import {
  getCookie,
  setCookie,
} from "hono/cookie";
import { readFileSync } from "fs";
import { ActorRefFromLogic, createActor, waitFor } from "xstate";
import { AuthorizationError } from "@slack/bolt";

type Variables = {
  connection: ActorRefFromLogic<typeof mcpClientMachine>;
  oauthProvider: InMemoryOAuthClientProvider;
  agentId: string;
  agent: {
    id: string;
    name: string;
    version: string;
    url: string; 
  };
  auth: {
    id: string;
    name: string;
    email: string;
    nickname: string;
  };
};

const app = new Hono<{ Variables: Variables }>();

// Unwrap Hono errors to see original error details
app.onError((err, c) => {
  console.error("Hono error:", err);
  
  // Check if it's an authorization error
  if (err.message?.includes("Authentication required") || err.message?.includes("Unauthorized")) {
    return c.json(
      {
        error: "Authentication required",
        code: 401,
      },
      401
    );
  }
  
  return c.json(
    {
      error: String(err),
      stack: err.stack,
    },
    500
  );
});

const connections = new Map<string, ReturnType<typeof createActor<typeof mcpClientMachine>>>();

const agentMiddleware = createMiddleware(async (c, next) => {
  const agentId = c.req.param("id") || c.var.auth?.id;
  if(!agentId) {
    return c.redirect("/login");
  }

  const url = agentId ? `${env.MCP_GATEWAY_URL}/${agentId}` : env.MCP_GATEWAY_URL!;
  
  const authProvider = c.get("oauthProvider")!;
  const connection = connections.has(authProvider.id) ?  connections.get(authProvider.id)! : connections.set(authProvider.id,createActor(mcpClientMachine, {
      input: {
        url: new URL(url),
        options: {
          info: {
            name: c.var.auth?.name || "me",
            version: "1.0.0",
          },
          transport: () =>
            new StreamableHTTPClientTransport(new URL(url), {
              authProvider: authProvider,
            }),
        },
      },
    } )).get(authProvider.id)!.start();
  
  // Wait for connection to be ready, failed, or authenticating
  await waitFor(connection, (state) => state.matches("ready") || state.matches("failed") || state.matches("authenticating") );
  const snapshot = connection.getSnapshot();
  
  if(snapshot.matches("authenticating")) { 
    if(authProvider.authorizationUrl.get()) {
      return c.redirect(authProvider.authorizationUrl.get(), 302);
    } else {
      return c.json({ error: snapshot.context.error?.message || "Authentication required", code: snapshot.context.error?.code || 401 }, 401);
    }
  }
  if(snapshot.matches("failed")) {
    const error = snapshot.context.error;
    return c.json(
      {
        error: error?.message || "Connection failed",
        code: error?.code || 500,
      },
      500
    );
  } 

  c.set("connection", connection);
  const info = await connection.getSnapshot().context.client?.callTool({
      name: "@registry:info",
      arguments: {},
    });
    console.log("agent info", info);
    c.set("agent", info?.structuredContent || { id: agentId, name: "Agent", version: "1.0.0", url });
     
  
  await next();
});

const oauthMiddleware = createMiddleware(async (c, next) => {
  const oauthId = await getCookie(c, "oauth-id");
  const url=new URL(c.req.url)
  console.log("oauth-id", oauthId,url);
  const redirectUri = `https://${url.host}/oauth/callback`;
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
    domain: `.${new URL(c.req.url).hostname}`,
    maxAge: 60 * 60 * 24 * 30,
  });

  const info = await oauthProvider.info();
  console.log("auth info", info);
  c.set("auth",info);

  await next();
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
        <script src="https://cdn.jsdelivr.net/npm/htmx-ext-sse@2.2.2" integrity="sha384-Y4gc0CK6Kg+hmulDc6rZPJu0tqvk7EWlih0Oh+2OkAi1ZDlCbBDCQEE2uVk472Ky" crossorigin="anonymous"></script>

      </head>
      <body class="bg-gray-50" hx-ext="sse">
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

app.get("/oauth/callback", async function (c) {
  const url = new URL(c.req.url);
  const state = c.req.query("state")!;
  const authCode = c.req.query("code")!;
  const oauthProvider = InMemoryOAuthClientProvider.fromState(state);
  const transport = new StreamableHTTPClientTransport(
    new URL(env.MCP_REGISTRY_URL!),
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
    
    // Check if we already have a connection for this user
    let connection = connections.get(oauthProvider.id);
    if (!connection) {
      // Create new connection
      connection = createActor(mcpClientMachine, {
        input: {
          url: new URL(env.MCP_REGISTRY_URL!),
          options: {
            info: {
              name: nickname || name || sub!,
              version: "1.0.0",
            },
            transport: () => transport,
          },
        },
      });
      connection.start();
      connections.set(oauthProvider.id!, connection);
    } else {
      // If connection exists and is in authenticating state, trigger authenticate event
      const snapshot = connection.getSnapshot();
      if (snapshot.matches("authenticating")) {
        connection.send({ type: "authenticate", authCode });
      }
    }

    await setCookie(c, "mcp-agent-id", sub!, {
      httpOnly: true,
      secure: c.req.url.startsWith("https://"),
      sameSite: "none",
      domain: `.${new URL(c.req.url).hostname}`,
      maxAge: 60 * 60 * 24 * 30,
    });

    await setCookie(c, "oauth-id", oauthProvider.id, {
      httpOnly: true,
      secure: c.req.url.startsWith("https://"),
      sameSite: "none",
      domain: `.${new URL(c.req.url).hostname}`,
      maxAge: 60 * 60 * 24 * 30,
    });

    const targetUrl =
      (await oauthProvider.get("original-url")) || `/agents/${sub}`;
    console.log("redirecting to", `${targetUrl}`);
    return c.redirect(`${targetUrl}`, 302);
  }
  
  // If no tokens, redirect to login
  return c.redirect("/login", 302);
});

const mcpAgentManager = new MCPAgentManager();

// Agent management endpoints
app.get("/agents", async (c) => {
  const agents = await mcpAgentManager.listAgents();
  return c.html(
    <html>
      <head>
        <title>MCP Agents</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <script src="https://cdn.jsdelivr.net/npm/htmx-ext-sse@2.2.2"  crossorigin="anonymous"></script>
      </head>
      <body hx-ext="sse">
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
  const connection = createActor(mcpClientMachine, {
    input: {
      url: new URL(env.MCP_MANAGER_URL!),
      options: {
        info: {
          name: "New Agent",
          version: "1.0.0",
        },
      },
    },
  });
  await connection.start();
  await connection.getSnapshot().context.client?.callTool({
    name: "@registry:create-agent",
    arguments: {
      name: "New Agent",
    },
  });
  c.redirect("/agents")
});
   
app.get("/agents/me", oauthMiddleware, agentMiddleware, async (c) => {
  return c.redirect(c.var.agent?.id ? `/agents/${c.var.agent.id}` : "/login");
});
// Agent-specific endpoints
app.get("/agents/:id", oauthMiddleware, agentMiddleware, async (c) => {
  const connection = c.var.connection;
  const {auth, agent} = c.var;
   if (connection.getSnapshot().matches("connecting")) {
    return c.html(
      <html>
        <body>
          <h1>Connecting...</h1>
        </body>
      </html>
    );
  }
  const {isError, content, structuredContent:{connections}} = await connection.getSnapshot().context.client?.callTool({
    name: "@registry:list",
    arguments: {},
  }) as CallToolResult & {structuredContent:{connections:serverConfig[]}}
 
  if (!connections || isError) {
    throw new Error(
      `Failed to list connections: ${
        content?.map((e) => e.text) || "Unknown error"
      }`
    );
  }

  return c.html(
    <html>
      <head>
        <title>MCP Agent: {agent?.name}</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <script src="https://cdn.jsdelivr.net/npm/htmx-ext-sse@2.2.2"  crossorigin="anonymous"></script>
      </head>
      <body hx-ext="sse"  >
        <div class="p-6 max-w-xl mx-auto">
          <h1 class="text-2xl font-bold mb-4">
            Hello {auth?.name} 
          </h1>
          <h1 class="text-2xl font-bold mb-4">
             Welcome to the MCP Agent{agent?.name ? `: ${agent?.name}` : ""}
            <span class="text-sm text-gray-500 ml-2">({agent?.id})</span>
          </h1>
          <span class="text-sm text-gray-500 ml-2 cursor-pointer" onclick={()=>{
            navigator.clipboard.writeText(agent?.url || "");
            alert("MCP Server URL copied to clipboard");
          }}>
            {`${agent?.url}`} 
            <span class="text-sm text-gray-500 ml-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" />
              </svg>
            </span>
          </span>
          <div class="mb-6">
            <h2 class="text-xl font-semibold mb-2">Connect to MCP Server</h2>
            <form
              hx-post={`/agents/${agent?.id}/connect`}
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
            {connections.length === 0 ? (
              <p class="text-gray-500">No servers connected</p>
            ) : (
              <ul class="divide-y">
                {connections.map((server) => (
                  <li class="py-2 flex justify-between items-center">
                    <div>
                      <div class="font-medium">{server.id}</div>
                      <div class="text-sm text-gray-500">{server.url}</div>
                    </div>
                    <button
                      class="bg-red-500 text-white px-3 py-1 rounded text-sm"
                      hx-delete={`/agents/${agent?.id}/server/${server.id}`}
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
              hx-get={`/agents/${agent?.id}/tools`}
              hx-trigger="load"
                // hx-ext="sse"
              // hx-swap="beforeend"
            
              // sse-swap="tool"
              class="flex flex-col gap-2"
              >
            </div>
          </div>
        </div>
      </body>
    </html>
  );
});

app.get("/agents/:id/sse", oauthMiddleware, agentMiddleware,  (c) => {
  return   streamSSE(c, async (stream) => {
    const agent = c.var.connection;
    const returned = {} as Record<string, boolean>;

    const snapshot = agent.getSnapshot();
   const subscription = agent.on("@updates.tools", (event) => {
      streamTools(agent.getSnapshot().context.tools);
    });
    subscription.unsubscribe();

    await streamTools(snapshot.context.tools);
  

    await new Promise((resolve) => {
      stream.onAbort(() => {
        resolve(true);
      });
    });
    subscription.unsubscribe();


    async function streamTools(tools: Tool[]) {
      for (const tool of tools) {
        const source = tool.source as any;
        if (!returned[tool.name]) {
          await stream.writeSSE({
            data: await html`<div class="py-2" id="${tool.name}">
              <div class="font-medium">${tool.name}</div>
              <div class="text-sm text-gray-500">${tool.description}</div>
              <div class="text-xs text-gray-400">
                Server: ${source?.server || 'unknown'} (${source?.name || tool.name})
              </div>
            </div>`,
            event: "tool",
            id: tool.name,
          }); 
          returned[tool.name] = true;
        }
      }
    }
  })
});
// Connect to a new MCP server
app.post("/agents/:id/connect", oauthMiddleware, agentMiddleware, async (c) => {
  const connection = c.var.connection;
  const agentId = c.req.param("id");
  const formData = await c.req.formData();
  const url = formData.get("url")?.toString();
  const id = formData.get("id")?.toString();
  
  const client = connection.getSnapshot().context.client;
  if (!client) {
    return c.json({ error: "Client not ready" }, 500);
  }
  
  try {
    const response = await client.callTool({
      name: "@registry:connect",
      arguments: {
        url,
        name: id,
        id,
      },
    });
    
    if (response && response.isError) {
      const content = response.content as any[];
      return c.render(
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>
            Failed to connect to MCP server:{" "}
            {String(content?.map((e: any) => e.text).join(`\n`))}
          </p>
        </div>
      );
    }
    
    const {structuredContent:{connections}} = await client.callTool({
      name: "@registry:list",
      arguments: {},
    }) as CallToolResult & {structuredContent:{connections:serverConfig[]}}
   
    return c.html(
      <div id="servers-list">
        <h2 class="text-xl font-semibold mb-2">Connected Servers</h2>
        {connections.length === 0 ? (
          <p class="text-gray-500">No servers connected</p>
        ) : (
          <ul class="divide-y">
            {connections.map((server) => (
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
    console.error("Error connecting to MCP server:", error);
    return c.render(
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>Failed to connect to MCP server: {String(error)}</p>
      </div>
    );
  }
});

// Disconnect from an MCP server
app.delete("/agents/:id/server/:server",  oauthMiddleware, agentMiddleware, async (c) => {
  const agentId = c.req.param("id");
  const serverId = c.req.param("server");
  const connection = c.var.connection;
  const client = connection.getSnapshot().context.client;

  if (!client) {
    return c.json({ error: "Client not ready" }, 500);
  }

  try {
    const result = await client.callTool({
      name: "@registry:disconnect",
      arguments: {
        id: serverId,
      },
    });
    
    if(result && result.isError){
      const content = result.content as any[];
      return c.html(
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>Failed to disconnect from MCP server: {String(content?.map((e: any) => e.text).join(`\n`))}</p>
        </div>
      );
    }
    
    // Get updated list of servers
    const {structuredContent: {connections: servers}} = await client.callTool({
      name: "@registry:list",
      arguments: {},
    }) as  CallToolResult & {structuredContent:{connections:(serverConfig & {status:string})[]}}
 
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
app.get("/agents/:id/tools", oauthMiddleware, agentMiddleware, async (c) =>

  await streamText(c, async (stream) => {
    const agent = c.var.connection;
    const returned = {} as Record<string, boolean>;
    const snapshot = agent.getSnapshot();
    await stream.writeln(await html`<ul class="divide-y"></ul>`);

 
    const subscription = agent.on("@updates.tools", (event) => {
      streamTools(agent.getSnapshot().context.tools);
    });

    await streamTools(snapshot.context.tools);

    if (snapshot.context.tools.length === 0) {
      await stream.writeln(
        await html`<p className="text-gray-500">Still loading tools...</p>`
      );
    }
    await stream.sleep(100);
    await Promise.race([
      new Promise(async (resolve) => {
        setTimeout(async () => {
          stream.writeln(await html`</ul>`);
          resolve(true);
        }, 20_000);
      }),
      new Promise((resolve) => {
        stream.onAbort(() => {
          resolve(true);
        });
      })]);
     subscription.unsubscribe();

    async function streamTools(tools: Tool[]) {
      for (const tool of tools) {
        const source = tool.source as any;
        if (!returned[tool.name]) {
          await stream.writeln(
            await html`<li class="py-2">
              <div class="font-medium">${tool.name}</div>
              <div class="text-sm text-gray-500">${tool.description}</div>
              <div class="text-xs text-gray-400">
                Server: ${source?.server || 'unknown'} (${source?.name || tool.name})
              </div>
            </li>`
          );
          returned[tool.name] = true;
        }
      }
    }
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


