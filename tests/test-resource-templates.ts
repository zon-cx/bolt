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

console.log('🧪 Testing Resource Templates with Router...');
console.log(`📡 Connecting to router at: ${ROUTER_URL}`);

// First, establish a connection using the MCP client to get a proper session
async function establishSession() {
  console.log('🔗 Establishing MCP session...');
  
  const testActor = createActor(mcpClientMachine, {
    input: {
      url: new URL(ROUTER_URL),
      options: {
        info: { name: "resource-template-test", version: "1.0.0" },
        auth: authInfo,
        session: "test-session",
      },
    },
  });

  return new Promise<{ sessionId: string; actor: any }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for session establishment'));
    }, 10000);

    testActor.subscribe((state) => {
      if (state.matches('ready')) {
        clearTimeout(timeout);
        console.log('✅ Session established successfully');
        resolve({ sessionId: "test-session", actor: testActor });
      } else if (state.matches('failed')) {
        clearTimeout(timeout);
        reject(new Error(`Failed to establish session: ${state.context.error?.message}`));
      }
    });

    testActor.start();
  });
}

// Test the router's resource templates endpoint directly
async function testResourceTemplatesEndpoint(sessionId: string) {
  try {
    const response = await fetch(`${ROUTER_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/templates/list',
        params: {}
      })
    });

    const result = await response.json();
    console.log('📋 Resource Templates Response:');
    console.log(JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.log(`❌ HTTP error! status: ${response.status}`);
      console.log('Response body:', result);
      return false;
    }

    if (result.error) {
      console.log('❌ Error in response:', result.error);
      return false;
    }

    if (result.result && result.result.resourceTemplates) {
      console.log(`✅ Found ${result.result.resourceTemplates.length} resource templates`);
      
      // Check if each template has the required uriTemplate field
      const validTemplates = result.result.resourceTemplates.filter((template: any) => {
        const hasUriTemplate = template.uriTemplate && typeof template.uriTemplate === 'string';
        if (!hasUriTemplate) {
          console.log(`⚠️ Template "${template.name}" missing uriTemplate field`);
        }
        return hasUriTemplate;
      });

      console.log(`✅ ${validTemplates.length} templates have valid uriTemplate fields`);
      return validTemplates.length === result.result.resourceTemplates.length;
    } else {
      console.log('ℹ️ No resource templates found (this is expected for current servers)');
      return true; // This is acceptable
    }
  } catch (error) {
    console.error('❌ Error testing resource templates endpoint:', error);
    return false;
  }
}

// Test the router's resources endpoint to see what's available
async function testResourcesEndpoint(sessionId: string) {
  try {
    const response = await fetch(`${ROUTER_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {}
      })
    });

    const result = await response.json();
    console.log('📋 Resources Response:');
    console.log(JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.log(`❌ HTTP error! status: ${response.status}`);
      console.log('Response body:', result);
      return false;
    }

    if (result.error) {
      console.log('❌ Error in response:', result.error);
      return false;
    }

    if (result.result && result.result.resources) {
      console.log(`✅ Found ${result.result.resources.length} resources`);
      return true;
    } else {
      console.log('ℹ️ No resources found');
      return true;
    }
  } catch (error) {
    console.error('❌ Error testing resources endpoint:', error);
    return false;
  }
}

// Run the tests
async function runTests() {
  try {
    console.log('\n🔗 Establishing session...');
    const { sessionId, actor } = await establishSession();
    
    // Wait a bit for the session to be fully established
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n🔍 Testing Resources Endpoint...');
    const resourcesOk = await testResourcesEndpoint(sessionId);
    
    console.log('\n🔍 Testing Resource Templates Endpoint...');
    const templatesOk = await testResourceTemplatesEndpoint(sessionId);
    
    console.log('\n📊 Test Results:');
    console.log(`   Resources endpoint: ${resourcesOk ? '✅ Pass' : '❌ Fail'}`);
    console.log(`   Resource templates endpoint: ${templatesOk ? '✅ Pass' : '❌ Fail'}`);
    
    if (resourcesOk && templatesOk) {
      console.log('\n🎉 All tests passed! The router is handling resource templates correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the error messages above.');
    }
    
    // Cleanup
    actor.send({ type: "cleanup" });
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

runTests().catch(console.error); 