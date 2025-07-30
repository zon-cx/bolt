# SSE Transport Support

This document describes the SSE (Server-Sent Events) transport support that has been added to the MCP client and server infrastructure.

## Overview

The MCP (Model Context Protocol) implementation now supports both Streamable HTTP and SSE transport types. This allows clients to connect to MCP servers using either transport mechanism based on their requirements and server capabilities.

## Transport Types

### 1. Streamable HTTP Transport
- **Endpoint**: `/mcp`
- **Type**: `"streamable"`
- **Description**: Uses HTTP streaming for bidirectional communication
- **Use Case**: Modern clients with full HTTP support

### 2. SSE Transport
- **Endpoint**: `/sse`
- **Type**: `"sse"`
- **Description**: Uses Server-Sent Events for real-time communication
- **Use Case**: Legacy clients, browsers, or environments with limited HTTP support

## Configuration

### Server Configuration

When connecting to an MCP server, you can specify the transport type:

```typescript
const serverConfig = {
  id: 'my-server',
  url: 'http://localhost:8080',
  name: 'My MCP Server',
  version: '1.0.0',
  type: 'sse' // or 'streamable'
};
```

### Client Configuration

The MCP client automatically handles transport creation based on the configuration:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// For SSE transport
const sseUrl = new URL('http://localhost:8080/sse');
const sseTransport = new SSEClientTransport(sseUrl);

// For streamable transport
const streamableUrl = new URL('http://localhost:8080/mcp');
const streamableTransport = new StreamableHTTPClientTransport(streamableUrl);
```

## Usage Examples

### Using the Registry Server

The registry server's `connect` tool now supports transport type specification:

```typescript
// Connect using streamable transport (default)
await registryClient.callTool('connect', {
  url: 'http://localhost:8080/mcp',
  name: 'my-server',
  type: 'streamable'
});

// Connect using SSE transport
await registryClient.callTool('connect', {
  url: 'http://localhost:8080/sse',
  name: 'my-sse-server',
  type: 'sse'
});
```

### Direct Client Usage

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function connectWithSSE() {
  const url = new URL('http://localhost:8080/sse');
  const transport = new SSEClientTransport(url);
  
  const client = new Client({
    name: 'sse-client',
    version: '1.0.0',
  });

  try {
    await client.connect(transport);
    console.log('Connected with SSE transport');
    
    // Use the client...
    const capabilities = await client.getServerCapabilities();
    console.log('Server capabilities:', capabilities);
    
    await transport.close();
  } catch (error) {
    console.error('Connection failed:', error);
  }
}
```

## Server Endpoints

### SSE Endpoints

The server provides the following SSE endpoints:

- `GET /sse` - Main SSE endpoint for general connections
- `GET /sse/:id` - SSE endpoint for specific agent connections
- `POST /messages` - Message endpoint for SSE connections
- `POST /messages/:id` - Message endpoint for specific agent SSE connections

### Streamable HTTP Endpoints

- `ALL /mcp` - Main streamable HTTP endpoint
- `ALL /mcp/:id` - Streamable HTTP endpoint for specific agent connections

## Transport Selection Logic

The client automatically selects the appropriate transport based on:

1. **Explicit transport type**: If specified in the configuration
2. **URL endpoint**: SSE URLs typically end with `/sse`
3. **Default fallback**: Streamable HTTP transport

## Error Handling

Both transport types handle errors consistently:

- Connection timeouts
- Authentication errors
- Network failures
- Server errors

## Testing

Run the test suite to verify SSE transport support:

```bash
npm test tests/test-sse-transport.ts
```

## Examples

See the `examples/sse-client-example.ts` file for complete usage examples.

## Migration

### From Streamable to SSE

If you need to migrate from streamable to SSE transport:

1. Update the server URL to use the `/sse` endpoint
2. Change the transport type to `"sse"`
3. Update any client code to use `SSEClientTransport`

### From SSE to Streamable

If you need to migrate from SSE to streamable transport:

1. Update the server URL to use the `/mcp` endpoint
2. Change the transport type to `"streamable"`
3. Update any client code to use `StreamableHTTPClientTransport`

## Limitations

- SSE transport may have higher latency compared to streamable HTTP
- Some advanced features may work differently between transport types
- Browser compatibility varies for different transport types

## Future Enhancements

- Automatic transport type detection
- Transport fallback mechanisms
- Performance optimizations for SSE transport
- Enhanced error handling and recovery 