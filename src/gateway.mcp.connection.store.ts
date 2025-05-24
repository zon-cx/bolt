import { Atom } from "@xstate/store";
import { MCPClientManager } from "./gateway.mcp.connection";
import { connectYjs } from "./store.yjs";
import { MCPClientConnection } from "./gateway.mcp.client";

export const mcpAgents: Record<string, MCPClientManager> = {};
  
export  type serverConfig = {
  id: string;
  url: string;
  name: string;
  version: string;
};

export type agentConfig = {
  id: string;
  name: string;
  created: string;
};

const doc = connectYjs("mcp:server");
const agentServerStore = (agentId: string) => {
  return doc.getMap<serverConfig>(`${agentId}`);
};

const agentsStore = doc.getMap<agentConfig>("agents");

export function createMcpAgent(id: string, name = id) {
  const agent = new MCPClientManager("assistant", "1.0.0", agentServerStore(id), id, id);
  mcpAgents[id] = agent;

  // Store agent metadata
  agentsStore.set(id, {
    id,
    name,
    created: new Date().toISOString(),
  });

  return agent;
}

export function getMcpAgent(id: string) {
  return mcpAgents[id];
}

export function getOrCreateMcpAgent(id: string) {
  if (mcpAgents[id]) {
    return mcpAgents[id];
  }

  // Check if agent exists in storage
  const agentConfig = agentsStore.get(id);
  if (agentConfig) {
    const agent = new MCPClientManager(
      "assistant",
      "1.0.0",
      agentServerStore(id),
      id,
      id,
    );
    mcpAgents[id] = agent;
    return agent;
  }

  // Create new agent if it doesn't exist
  return createMcpAgent(id);
}

export function listAgents() {
  const agents: agentConfig[] = [];
  for (const [id, config] of agentsStore.entries()) {
    agents.push(config);
  }
  return agents;
}


export function deleteAgent(id: string) {
  console.log("deleting agent", id);
  if (mcpAgents[id]) {
    mcpAgents[id].closeAllConnections();
    delete mcpAgents[id];
  }

  agentsStore.delete(id);

  // Clean up server connections for this agent
  const serverStore = agentServerStore(id);
  for (const key of serverStore.keys()) {
    serverStore.delete(key);
  }
}

// Initialize existing agents from storage
for (const [id] of agentsStore.entries()) {
  getOrCreateMcpAgent(id);
}

