#!/usr/bin/env node

import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { URL } from "node:url";
import { exec } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  CallToolRequest,
  ListToolsRequest,
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { connectYjs } from "@/store.yjs.ts";
import * as Y from "yjs";
import { randomFill, randomFillSync, randomUUID } from "node:crypto";
import { createAtom } from "@xstate/store";
import { jwtDecode } from "jwt-decode";
// Configuration
const CALLBACK_PORT = 8090; // Use different port than auth server (3001)
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/oauth/callback`;

const authState = connectYjs("@mcp.auth");

async function logRedirect(url: URL) {
  console.log(`mock redirect to: ${url.toString()}`);
}

function getCode(length = 4) {
  let max = Number("1".padEnd(length + 1, "0"));
  return `${Math.floor(Math.random() * max)}`.padStart(length, "0");
}

/**
 * In-memory OAuth client provider for demonstration purposes
 * In production, you should persist tokens securely
 */
export class InMemoryOAuthClientProvider implements OAuthClientProvider {
  public authorizationUrl = createAtom<URL | undefined>(undefined);

  constructor(
    redirectUrl: string | URL,
    clientMetadata: OAuthClientMetadata,
    public id: string = getCode(6),
    private readonly onRedirect: (url: URL) => any | Promise<any> = (
      url: URL
    ) => {
      console.log("on redirect to: ", url);
      this.authorizationUrl.set(url);
    }
  ) {
    authState.getMap(this.id).set("redirectUrl", redirectUrl);
    authState.getMap(this.id).set("clientMetadata", clientMetadata);
    authState.getMap(this.id).set("id", id);
  }

  static fromState(
    id: string,
    onRedirect: (url: URL) => void | Promise<void> = logRedirect
  ): InMemoryOAuthClientProvider {
    return new InMemoryOAuthClientProvider(
      authState.getMap<string>(id).get("redirectUrl")!,
      authState.getMap<OAuthClientMetadata>(id).get("clientMetadata")!,
      id,
      onRedirect
    );
  }

  public finishAuth(authCode: string) {
    authState.getMap<string>(this.id).set("code", authCode);
  }

  public async save<T>(key: string, value: T) {
    authState.getMap<T>(this.id).set(key, value);
  }
  public async get<T>(key: string) {
    return authState.getMap<T>(this.id).get(key);
  }

  get redirectUrl(): string | URL {
    return authState.getMap<string | URL>(this.id).get("redirectUrl")!;
  }

  get clientMetadata(): OAuthClientMetadata {
    console.log(
      "clientMetadata",
      authState.getMap<OAuthClientMetadata>(this.id).get("clientMetadata")!
    );
    return authState
      .getMap<OAuthClientMetadata>(this.id)
      .get("clientMetadata")!;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return authState
      .getMap<OAuthClientInformationFull>(this.id)
      .get("clientInformation");
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    authState.getMap(this.id).set("clientInformation", clientInformation);
  }

  tokens(): OAuthTokens | undefined {
    return authState.getMap<OAuthTokens>(this.id).get("tokens");
  }

  saveTokens(tokens: OAuthTokens): void {
    authState.getMap<OAuthTokens>(this.id).set("tokens", tokens);
  }

  state(): string | Promise<string> {
    return this.id;
  }

  public async info(): Promise<
    { id: string; name: string; email: string } | undefined
  > {
    const tokens = this.tokens();
   
    if (tokens?.access_token ) {
      const iss =  jwtDecode(tokens?.access_token).iss;
      const userInfoUrl = new URL(`${iss}/userinfo`);
      console.log("userInfoUrl", userInfoUrl.toString());
      const userInfo = await fetch(
        userInfoUrl.toString(),
        {
          headers: {
            Authorization: `Bearer ${tokens?.access_token}`,
          },
        }
      );
      const userInfoJson = await userInfo.json();
      console.log("userInfo", userInfoJson);
      return {
        id: userInfoJson.sub,
        name: userInfoJson.name || userInfoJson.nickname || userInfoJson.given_name,
        email: userInfoJson.email,
      };
    }
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string): void {
    authState.getMap<string>(this.id).set("codeVerifier", codeVerifier);
  }

  codeVerifier(): string {
    if (!authState.getMap<string>(this.id).get("codeVerifier"))
      throw new Error("No code verifier saved");
    return authState.getMap<string>(this.id).get("codeVerifier")!;
  }
}

/**
 * Interactive MCP client with OAuth authentication
 * Demonstrates the complete OAuth flow with browser-based authorization
 */
class InteractiveOAuthClient {
  private client: Client | null = null;
  private readonly rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  constructor(private serverUrl: string) {}

  /**
   * Prompts user for input via readline
   */
  private async question(query: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(query, resolve);
    });
  }

  /**
   * Opens the authorization URL in the user's default browser
   */
  private async openBrowser(url: string): Promise<void> {
    console.log(`🌐 Opening browser for authorization: ${url}`);

    const command = `open "${url}"`;

    exec(command, (error) => {
      if (error) {
        console.error(`Failed to open browser: ${error.message}`);
        console.log(`Please manually open: ${url}`);
      }
    });
  }
  /**
   * Example OAuth callback handler - in production, use a more robust approach
   * for handling callbacks and storing tokens
   */
  /**
   * Starts a temporary HTTP server to receive the OAuth callback
   */
  private async waitForOAuthCallback(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        // Ignore favicon requests
        if (req.url === "/favicon.ico") {
          res.writeHead(404);
          res.end();
          return;
        }

        console.log(`📥 Received callback: ${req.url}`);
        const parsedUrl = new URL(req.url || "", "http://localhost");
        const code = parsedUrl.searchParams.get("code");
        const error = parsedUrl.searchParams.get("error");

        if (code) {
          console.log(
            `✅ Authorization code received: ${code?.substring(0, 10)}...`
          );
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);

          resolve(code);
          setTimeout(() => server.close(), 3000);
        } else if (error) {
          console.log(`❌ Authorization error: ${error}`);
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Authorization Failed</h1>
                <p>Error: ${error}</p>
              </body>
            </html>
          `);
          reject(new Error(`OAuth authorization failed: ${error}`));
        } else {
          console.log(`❌ No authorization code or error in callback`);
          res.writeHead(400);
          res.end("Bad request");
          reject(new Error("No authorization code provided"));
        }
      });

      server.listen(CALLBACK_PORT, () => {
        console.log(
          `OAuth callback server started on http://localhost:${CALLBACK_PORT}`
        );
      });
    });
  }

  private async attemptConnection(
    oauthProvider: InMemoryOAuthClientProvider
  ): Promise<void> {
    console.log("🚢 Creating transport with OAuth provider...");
    const baseUrl = new URL(this.serverUrl);
    const transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: oauthProvider,
    });
    console.log("🚢 Transport created", baseUrl.href);

    try {
      console.log(
        "🔌 Attempting connection (this will trigger OAuth redirect)..."
      );
      await this.client!.connect(transport);
      console.log("✅ Connected successfully");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        console.log("🔐 OAuth required - waiting for authorization...");
        const callbackPromise = this.waitForOAuthCallback();
        const authCode = await callbackPromise;
        await transport.finishAuth(authCode);
        console.log("🔐 Authorization code received:", authCode);
        console.log("🔌 Reconnecting with authenticated transport...");
        await this.attemptConnection(oauthProvider);
      } else {
        console.error(
          "❌ Connection failed with non-auth error:",
          error,
          "serverUrl",
          this.serverUrl
        );
        throw error;
      }
    }
  }

  /**
   * Establishes connection to the MCP server with OAuth authentication
   */
  async connect(): Promise<void> {
    console.log(`🔗 Attempting to connect to ${this.serverUrl}...`);

    const clientMetadata: OAuthClientMetadata = {
      client_name: "Simple OAuth MCP Client",
      redirect_uris: [CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: "mcp:tools",
    };

    console.log("🔐 Creating OAuth provider...");
    const oauthProvider = new InMemoryOAuthClientProvider(
      CALLBACK_URL,
      clientMetadata,
      (redirectUrl: URL) => {
        console.log(`📌 OAuth redirect handler called - opening browser`);
        console.log(`Opening browser to: ${redirectUrl.toString()}`);
        this.openBrowser(redirectUrl.toString());
      }
    );
    console.log("🔐 OAuth provider created");

    console.log("👤 Creating MCP client...");
    this.client = new Client(
      {
        name: "simple-oauth-client",
        version: "1.0.0",
      },
      { capabilities: {} }
    );
    console.log("👤 Client created");

    console.log("🔐 Starting OAuth flow...");

    await this.attemptConnection(oauthProvider);

    // Start interactive loop
    await this.interactiveLoop();
  }

  /**
   * Main interactive loop for user commands
   */
  async interactiveLoop(): Promise<void> {
    console.log("\n🎯 Interactive MCP Client with OAuth");
    console.log("Commands:");
    console.log("  list - List available tools");
    console.log("  call <tool_name> [args] - Call a tool");
    console.log("  quit - Exit the client");
    console.log();

    while (true) {
      try {
        const command = await this.question("mcp> ");

        if (!command.trim()) {
          continue;
        }

        if (command === "quit") {
          break;
        } else if (command === "list") {
          await this.listTools();
        } else if (command.startsWith("call ")) {
          await this.handleCallTool(command);
        } else {
          console.log(
            "❌ Unknown command. Try 'list', 'call <tool_name>', or 'quit'"
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message === "SIGINT") {
          console.log("\n\n👋 Goodbye!");
          break;
        }
        console.error("❌ Error:", error);
      }
    }
  }

  private async listTools(): Promise<void> {
    if (!this.client) {
      console.log("❌ Not connected to server");
      return;
    }

    try {
      const request: ListToolsRequest = {
        method: "tools/list",
        params: {},
      };

      const result = await this.client.request(request, ListToolsResultSchema);

      if (result.tools && result.tools.length > 0) {
        console.log("\n📋 Available tools:");
        result.tools.forEach((tool, index) => {
          console.log(`${index + 1}. ${tool.name}`);
          if (tool.description) {
            console.log(`   Description: ${tool.description}`);
          }
          console.log();
        });
      } else {
        console.log("No tools available");
      }
    } catch (error) {
      console.error("❌ Failed to list tools:", error);
    }
  }

  private async handleCallTool(command: string): Promise<void> {
    const parts = command.split(/\s+/);
    const toolName = parts[1];

    if (!toolName) {
      console.log("❌ Please specify a tool name");
      return;
    }

    // Parse arguments (simple JSON-like format)
    let toolArgs: Record<string, unknown> = {};
    if (parts.length > 2) {
      const argsString = parts.slice(2).join(" ");
      try {
        toolArgs = JSON.parse(argsString);
      } catch {
        console.log("❌ Invalid arguments format (expected JSON)");
        return;
      }
    }

    await this.callTool(toolName, toolArgs);
  }

  private async callTool(
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<void> {
    if (!this.client) {
      console.log("❌ Not connected to server");
      return;
    }

    try {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolArgs,
        },
      };

      const result = await this.client.request(request, CallToolResultSchema);

      console.log(`\n🔧 Tool '${toolName}' result:`);
      if (result.content) {
        result.content.forEach((content) => {
          if (content.type === "text") {
            console.log(content.text);
          } else {
            console.log(content);
          }
        });
      } else {
        console.log(result);
      }
    } catch (error) {
      console.error(`❌ Failed to call tool '${toolName}':`, error);
    }
  }

  close(): void {
    this.rl.close();
    if (this.client) {
      // Note: Client doesn't have a close method in the current implementation
      // This would typically close the transport connection
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const serverUrl = process.env.MCP_GATEWAY_URL || "http://localhost:8080/mcp";

  console.log("🚀 Simple MCP OAuth Client");
  console.log(`Connecting to: ${serverUrl}`);
  console.log();

  const client = new InteractiveOAuthClient(serverUrl);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n👋 Goodbye!");
    client.close();
    process.exit(0);
  });

  try {
    await client.connect();
  } catch (error) {
    console.error("Failed to start client:", error);
    process.exit(1);
  } finally {
    client.close();
  }
}

// // Run if this file is executed directly
// main().catch((error) => {
//   console.error('Unhandled error:', error);
//   process.exit(1);
// });
