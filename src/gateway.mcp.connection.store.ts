import {Atom, Subscription} from "@xstate/store";
import { MCPClientManager } from "./gateway.mcp.connection";
import { connectYjs } from "./store.yjs";
import { MCPClientConnection } from "./gateway.mcp.client";
import McpServer from "../ref/mcp.*/mcp.server.tsx";

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

export function createMcpAgent({id, name, created}: Partial<agentConfig> & {id: string}, mcpServer?:McpServer) {
  const agent = new MCPClientManager(id, "1.0.0", agentServerStore(id));
  mcpAgents[id] = agent;

  // Store agent metadata
  agentsStore.set(id, {
    id,
    name: name || id,
    created: created || new Date().toISOString(),
  });

  if(!!mcpServer) {
    const subscriptions: Subscription[] = [
      agent.tools.subscribe(() => {
        if (agent.tools.get()) mcpServer.sendToolListChanged();
      }),
      agent.prompts.subscribe(() => {
        if (agent.prompts.get()) mcpServer.sendPromptListChanged();
      })
      , agent.resources.subscribe(() => {
        if (agent.resources.get()) mcpServer.sendResourceListChanged();
      }),
      agent.resourceTemplates.subscribe(() => {
        if (agent.resourceTemplates.get()) mcpServer.sendResourceListChanged();
      })
    ];
    agent.onClose( () => {
      console.log("Agent closed", id);
      delete mcpAgents[id];
      subscriptions.forEach((sub) => {
        sub.unsubscribe();
      })
    });
  }
  

  return agent;
}

export function getMcpAgent(id: string) {
  return mcpAgents[id];
}

export function getOrCreateMcpAgent(id: string | Partial<agentConfig> & {id: string}, mcpServer?:McpServer) {
  if(typeof id === "string") {
    id = {id, name: id, created: new Date().toISOString()};
  }
  if (mcpAgents[id.id]) {
    return Object.assign(mcpAgents[id.id], agentsStore.get(id.id));
  }
 
  
  // Create new agent if it doesn't exist
  return  Object.assign(createMcpAgent(id, mcpServer), agentsStore.get(id.id));
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

