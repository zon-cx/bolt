import { MCPClientManager } from "./registry.mcp.client";
import { connectYjs } from "./store.yjs";
import { yMapIterate } from "@cxai/stream";
import { Server  } from "@modelcontextprotocol/sdk/server/index.js";

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

 

export class MCPAgentManager {
  public mcpAgents: Record<string, MCPClientManager & agentConfig> = {};
  constructor( public mcpServer?:Server,public store = agentsStore) {
    this.initFromStore();
  }


  async initFromStore() {
    for await (const [id] of yMapIterate(this.store)) {
      const config = this.store.get(id);
      if (!config) continue;
      this.initAgent({
        id,
        name: config.name,
        created: config.created,
      });
    }
  }


  initAgent(
    id: string | (Partial<agentConfig> & { id: string })  ) {
    const info = {
      name: typeof id === "string" ? id : id.name,
      created: new Date().toISOString(),
      ...(this.store.get(typeof id === "string" ? id : id.id) || {}),
      ...(typeof id === "string" ? { id: id } : id),
    };
    if (this.mcpAgents[info.id]) {
      return this.mcpAgents[info.id];
    }
    return this.createAgent(info);
  }


  createAgent({
    id,
    name,
    created,
  }: Partial<agentConfig> & { id: string }) {

    agentsStore.set(id, {
      id,
      name: name || id,
      created: created || new Date().toISOString(),
    });

    const agent = new MCPClientManager(id, "1.0.0", agentServerStore(id));
    if(!!this.mcpServer) {
      agent.bindToMcpServer(this.mcpServer);
    } 

    this.mcpAgents[id] = Object.assign(agent, agentsStore.get(id)!); 
 

    return this.mcpAgents[id]!;
  } 

  async listAgents() {
    return Array.from(this.store.entries()).map(([id, config]) => config);
  }

  async deleteAgent(id: string) {
    delete this.mcpAgents[id];
    this.store.delete(id);
  }

}
 

export const mcpAgentManager = new MCPAgentManager();