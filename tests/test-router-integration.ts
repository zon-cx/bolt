import { createActor } from 'xstate';
import mcpClientMachine from '../src/mcp.client.js';
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// Test configuration
const ROUTER_URL = "http://localhost:8080/mcp/test-client";
const AUTH_TOKEN = "eyJ0eXAiOiJhdCtKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik9FVkJNVU0xUkVWQ1JEQXpPVEZGTlRJNE0wSXhRemN6UXpJM056UkRORFkzT0VORVF6Y3dNQSIsImN0eF9tb2RlIjoibG9naW4ifQ.eyJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiaWF0IjoxNzQ4MTIzMjI2LCJleHAiOjE3Nzk2NTkyMjYsImNsaWVudF9pZCI6ImRjci5WWk9SQmwyTWZpOE5ub0tpRVk2enNGNmxDaWh4NjZINFBDUVJlZyIsImF1ZCI6ImRjci5WWk9SQmwyTWZpOE5ub0tpRVk2enNGNmxDaWh4NjZINFBDUVJlZyIsImlzcyI6Imh0dHBzOi8vZ2lneWEuYXV0aHouaWQvb2lkYy9vcC92MS4wLzRfeUNYdXZRNTJVeDUyQmRhUVR4VVZoZyIsInN1YiI6IjRkYjI3ODg3ZjE1ODQ3ZjliZTFjY2Y5MjMzNGRmYmIzIiwic2lkIjoiMzAzMjc0NzQwMjI2X0xnSVZvTWxmV24tTlFLT1kzajBLV3ZkeHhwMCIsImp0aSI6InN0Mi5zLkF0THR0Tkx0MmcuYl9QZkZzT1YwVFctQzlfSG80OXRPVFcwcF9uWHItYWtnQVJXeEoxdk9kMDhHa3ZpU3J1RVJqU0tncDltNTdsbXk4MHN5eHBNT0ZhaGlVZFNoa3JUd0d1Wjl3MC0yVUVFVUVVc2s0bDlNSmFJb3VkLTJjamxsRE9DTGQxVGVIQ1YuYkQtREJwVlp0RlhUMXYzTndVcFUxYkJELXRINl9jRUtULVRqTk1Qc1JuZmJJXzRzMHJFZERKN3R3andLT3p4ZGozS3JxbV9tRGRSckg4ejJrUGtEdncuc2MzIiwiYXpwIjoiZGNyLlZaT1JCbDJNZmk4Tm5vS2lFWTZ6c0Y2bENpaHg2Nkg0UENRUmVnIn0.KLVgCS9gR_Nv_qykgIky-QU0ynw9Eg0y2Xhba71NJBeJJyH3WoR0v9cxflQAc_70jDS14rUiCulZ24iq_ZaVxfR3GtXQodxHkKa6wT6PwzHynQdDiMPTyUk3bPW7x4hkr3Q-xKCh6cl9O9WDcnWCCbR-ZqazfFBBPYUdDxC9WOAcavGTTdJFw-ID_w_EReHI1_E7OYxoKo45cpcMLb2uxxb2ym3vGqaRBUnHvcdYeWN3QDcMQxf5ugt2-8AJr7UWBWt8J5x-4qnzHLkBoqvBbXaOAnhIgIu27NQS-8TG8X9aE146nlLN1-MOanozG3ytTHm46e_X4d0-YcSHsS1ptA";

const authInfo: AuthInfo = {
  scopes: ["openid", "profile", "email"],
  token: AUTH_TOKEN,
  clientId: "dcr.VZORBl2Mfi8NnoKiEY6zsF6lCihx66H4PCQReg",
};

console.log('🚀 Starting MCP Client Router Integration Test...');
console.log(`📡 Connecting to router at: ${ROUTER_URL}`);

const testActor = createActor(mcpClientMachine, {
  input: {
    url: new URL(ROUTER_URL),
    options: {
      info: { name: "router-test-client", version: "1.0.0" },
      auth: authInfo,
      session: "test",
    },
  },
});

let testResults = {
  connected: false,
  tools: 0,
  resources: 0,
  resourceTemplates: 0,
  prompts: 0,
  completionTested: false,
  completionSuccess: false
};

testActor.subscribe((state) => {
  console.log(`[Router Test] State: ${state.value}, Error: ${state.context.error?.message || 'none'}`);
  
  if (state.matches('ready')) {
    console.log('✅ Connected to router successfully!');
    testResults.connected = true;
    
    // Log available data
    testResults.tools = state.context.tools?.length || 0;
    testResults.resources = state.context.resources?.length || 0;
    testResults.resourceTemplates = state.context.resourceTemplates?.length || 0;
    testResults.prompts = state.context.prompts?.length || 0;
    
    console.log(`📊 Available data:`);
    console.log(`   Tools: ${testResults.tools}`);
    console.log(`   Resources: ${testResults.resources}`);
    console.log(`   Resource Templates: ${testResults.resourceTemplates}`);
    console.log(`   Prompts: ${testResults.prompts}`);
    
    // Log specific items
    if (state.context.tools?.length > 0) {
      console.log(`   Tool names: ${state.context.tools.map((t: any) => t.name).join(', ')}`);
    }
    if (state.context.resources?.length > 0) {
      console.log(`   Resource names: ${state.context.resources.map((r: any) => r.name).join(', ')}`);
    }
    if (state.context.resourceTemplates?.length > 0) {
      console.log(`   Resource template names: ${state.context.resourceTemplates.map((rt: any) => rt.name).join(', ')}`);
    }
    if (state.context.prompts?.length > 0) {
      console.log(`   Prompt names: ${state.context.prompts.map((p: any) => p.name).join(', ')}`);
    }
    
    // Test completion with resource template
    if (state.context.client && !testResults.completionTested) {
      testResults.completionTested = true;
      console.log('🧪 Testing completion with resource template...');
      
      state.context.client.complete({
        ref: {
          type: "ref/resource",
          uri: "urn:mcp:server/registry"
        },
        argument: {
          name: "registry",
          value: "test value"
        }
      }).then((result: any) => {
        console.log('✅ Completion test successful:', result);
        testResults.completionSuccess = true;
        printTestSummary();
        testActor.send({ type: "cleanup" });
      }).catch((error: any) => {
        console.log('⚠️ Completion test failed (expected for some servers):', error.message);
        testResults.completionSuccess = false;
        printTestSummary();
        testActor.send({ type: "cleanup" });
      });
    }
  } else if (state.matches('failed')) {
    console.log('❌ Failed to connect to router:', state.context.error?.message);
    printTestSummary();
    process.exit(1);
  }
});

function printTestSummary() {
  console.log('\n📋 Test Summary:');
  console.log(`   Connection: ${testResults.connected ? '✅ Success' : '❌ Failed'}`);
  console.log(`   Tools found: ${testResults.tools}`);
  console.log(`   Resources found: ${testResults.resources}`);
  console.log(`   Resource Templates found: ${testResults.resourceTemplates}`);
  console.log(`   Prompts found: ${testResults.prompts}`);
  console.log(`   Completion test: ${testResults.completionTested ? (testResults.completionSuccess ? '✅ Success' : '⚠️ Failed (expected)') : '⏭️ Skipped'}`);
  
  if (testResults.resourceTemplates > 0) {
    console.log('\n🎉 Resource templates are working! The integration is successful.');
  } else {
    console.log('\n⚠️ No resource templates found. This might be expected depending on the server configuration.');
  }
}

// Start the test
testActor.start();

// Set a timeout to prevent hanging
setTimeout(() => {
  if (!testResults.connected) {
    console.log('⏰ Test timeout - router might not be running');
    printTestSummary();
    process.exit(1);
  }
}, 15000); 