#!/usr/bin/env node

/**
 * Test script to verify the dashboard integration with simple MCP client
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = new URL("http://localhost:8080/mcp");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "test-token";

async function testSimpleClient() {
  console.log("Testing simple MCP client integration...");
  
  try {
    // Create transport
    const transport = new StreamableHTTPClientTransport(MCP_URL, {
      requestInit: {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      },
    });

    // Create client
    const client = new Client({
      name: "dashboard-tester",
      version: "1.0.0",
    });

    console.log("Connecting to MCP server...");
    
    // Connect with timeout
    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 10_000)
      ),
    ]);

    console.log("Connected, pinging...");
    
    // Ping with timeout
    await Promise.race([
      client.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Ping timeout")), 5_000)
      ),
    ]);

    console.log("Ping successful, getting server capabilities...");
    
    // Get server capabilities
    const caps = await client.getServerCapabilities();
    console.log("Server capabilities:", caps);

    // Test registry tools
    console.log("Testing registry tools...");
    
    try {
      const info = await client.callTool({
        name: "registry:info",
        arguments: {},
      });
      console.log("Registry info:", info);
    } catch (error) {
      console.log("Registry info not available:", error.message);
    }

    try {
      const connections = await client.callTool({
        name: "registry:list-connections",
        arguments: {},
      });
      console.log("Registry connections:", connections);
    } catch (error) {
      console.log("Registry connections not available:", error.message);
    }

    // List all tools
    console.log("Listing all tools...");
    let allTools = [];
    let res = { tools: [] };
    do {
      res = await client.listTools({ cursor: res.nextCursor });
      allTools = allTools.concat(res.tools);
    } while (res.nextCursor);
    
    console.log(`Found ${allTools.length} tools:`);
    allTools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    await client.close();
    await transport.close();
    
    console.log("✅ Simple MCP client test completed successfully!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testSimpleClient(); 