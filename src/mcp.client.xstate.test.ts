import { jest } from '@jest/globals';
import { createActor } from 'xstate';
import mcpClientMachine from './mcp.client';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Create mock functions
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockPing = jest.fn().mockResolvedValue(undefined);
const mockGetServerCapabilities = jest.fn().mockResolvedValue({
  tools: { listChanged: true },
  resources: { listChanged: true },
  prompts: { listChanged: true }
});
const mockGetInstructions = jest.fn().mockResolvedValue('Test Instructions');
const mockListTools = jest.fn().mockResolvedValue({ tools: [] });
const mockListResources = jest.fn().mockResolvedValue({ resources: [] });
const mockListPrompts = jest.fn().mockResolvedValue({ prompts: [] });
const mockListResourceTemplates = jest.fn().mockResolvedValue({ resourceTemplates: [] });
const mockReadResource = jest.fn();


// Mock the MCP SDK classes
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    ping: mockPing,
    getServerCapabilities: mockGetServerCapabilities,
    getInstructions: mockGetInstructions,
    listTools: mockListTools,
    listResources: mockListResources,
    listPrompts: mockListPrompts,
    listResourceTemplates: mockListResourceTemplates,
    readResource: mockReadResource,
  }))
}));

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn().mockImplementation(() => ({
    close: mockClose
  }))
}));

describe('MCP Client State Machine', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  it('should transition through states correctly on successful connection', async () => {
    const actor = createActor(mcpClientMachine, {
      input: {
        url: new URL('http://test.com'),
        options: {
          info: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      }
    });

    // Create a promise that resolves when we reach the ready state
    const readyPromise = new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches('ready')) {
          resolve();
        }
      });
    });

    // Start the actor
    actor.start();

    // Wait for the ready state
    await readyPromise;

    // Verify the state transitions
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(mockGetServerCapabilities).toHaveBeenCalledTimes(1);
    expect(mockGetInstructions).toHaveBeenCalledTimes(1);
    expect(mockListTools).toHaveBeenCalledTimes(1);
    expect(mockListResources).toHaveBeenCalledTimes(1);
    expect(mockListPrompts).toHaveBeenCalledTimes(1);
    expect(mockListResourceTemplates).toHaveBeenCalledTimes(1);

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('ready')).toBe(true);
    expect(snapshot.context.error).toBeUndefined();
  });

  it('should handle connection failures and retry', async () => {
    // Make the connection fail once
    mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

    const actor = createActor(mcpClientMachine, {
      input: {
        url: new URL('http://test.com'),
        options: {
          info: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      }
    });

    // Create a promise that resolves when we reach the failed state
    const failedPromise = new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches('failed')) {
          resolve();
        }
      });
    });

    // Start the actor
    actor.start();

    // Wait for the failed state
    await failedPromise;

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('failed')).toBe(true);
    expect(snapshot.context.error).toBeDefined();
    expect(snapshot.context.error?.message).toBe('Connection failed');
  });

  it('should handle resource data updates', async () => {
    const actor = createActor(mcpClientMachine, {
      input: {
        url: new URL('http://test.com'),
        options: {
          info: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      }
    });

    // Create a promise that resolves when we reach the ready state
    const readyPromise = new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches('ready')) {
          resolve();
        }
      });
    });

    // Start the actor
    actor.start();

    // Wait for the ready state
    await readyPromise;

    // Mock resource data
    const mockResource = {
      name: 'test-resource',
      uri: 'test-uri',
      mimeType: 'text/plain'
    };

    // Mock readResource response
    mockReadResource.mockResolvedValue({
      contents: [{ text: 'test content' }]
    });

    // Send resource update
    actor.send({
      type: '@updates.resources',
      resources: [mockResource]
    });

    // Wait for the resource data to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.resources).toContainEqual(mockResource);
    expect(mockReadResource).toHaveBeenCalledWith({ uri: 'test-uri' });
  });

  it('should clean up resources on cleanup', async () => {
    const actor = createActor(mcpClientMachine, {
      input: {
        url: new URL('http://test.com'),
        options: {
          info: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      }
    });

    // Create a promise that resolves when we reach the ready state
    const readyPromise = new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches('ready')) {
          resolve();
        }
      });
    });

    // Start the actor
    actor.start();

    // Wait for the ready state
    await readyPromise;

    // Create a promise that resolves when we reach the done state
    const donePromise = new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches('done')) {
          resolve();
        }
      });
    });

    // Send cleanup event
    actor.send({ type: 'cleanup' });

    // Wait for cleanup to complete
    await donePromise;

    expect(mockClose).toHaveBeenCalled();
  });
}); 