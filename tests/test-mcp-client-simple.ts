import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = new URL("http://localhost:8080/mcp");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "test-token";

async function testMCPClient() {
  console.log("Testing MCP client against local router...");
  
  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    },
  });

  const client = new Client({
    name: "simple-tester",
    version: "1.0.0",
  });

  try {
    console.log("Connecting to MCP server...");
    await client.connect(transport);
    
    console.log("Pinging server...");
    await client.ping();
    console.log("✅ Ping successful");
    
    console.log("Getting server capabilities...");
    const caps = await client.getServerCapabilities();
    console.log("✅ Server capabilities:", caps);
    
    console.log("Listing tools...");
    const tools = await client.listTools();
    console.log("✅ Tools:", tools.tools.length, "found");
    tools.tools.forEach(tool => console.log(`  - ${tool.name}`));
    
    console.log("Listing resources...");
    const resources = await client.listResources();
    console.log("✅ Resources:", resources.resources.length, "found");
    resources.resources.forEach(resource => console.log(`  - ${resource.name}`));
    
    console.log("Listing resource templates...");
    const templates = await client.listResourceTemplates();
    console.log("✅ Resource templates:", templates.resourceTemplates.length, "found");
    templates.resourceTemplates.forEach(template => console.log(`  - ${template.name}`));
    
    console.log("Listing prompts...");
    const prompts = await client.listPrompts();
    console.log("✅ Prompts:", prompts.prompts.length, "found");
    prompts.prompts.forEach(prompt => console.log(`  - ${prompt.name}`));
    
    // Test tool calling if we have tools
    if (tools.tools.length > 0) {
      const firstTool = tools.tools[0];
      console.log(`Testing tool call: ${firstTool.name}`);
      try {
        const result = await client.callTool({ 
          name: firstTool.name, 
          arguments: {} 
        });
        console.log("✅ Tool call successful:", result);
      } catch (error) {
        console.log("⚠️ Tool call failed:", error.message);
      }
    }
    
    // Test completion if we have resources
    if (resources.resources.length > 0) {
      const firstResource = resources.resources[0];
      console.log(`Testing completion with resource: ${firstResource.name}`);
      try {
        const result = await client.complete({
          ref: { type: "ref/resource", uri: firstResource.uri },
          argument: { name: "test", value: "test value" }
        });
        console.log("✅ Completion successful:", result);
      } catch (error) {
        console.log("⚠️ Completion failed:", error.message);
      }
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    console.log("Closing connection...");
    await client.close();
    await transport.close();
  }
}

testMCPClient().catch(console.error); 