import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { MCPClientManager } from "./registry.mcp.client";
import { connectYjs } from "./store.yjs";
import { yMapIterate } from "@cxai/stream";
import { Server  } from "@modelcontextprotocol/sdk/server/index.js";
import * as Y from "yjs";

export const mcpAgents: Record<string, MCPClientManager> = {};
  
export  type serverConfig = {
  id: string;
  url: string;
  name?: string;
  version: string;
};

export type agentConfig = {
  id: string;
  name: string;
  created: string;
};

const doc =  connectYjs("mcp:server");
const agentServerStore = (agentId: string): Y.Map<serverConfig> => {
  return doc.getMap<serverConfig>(`${agentId}`);
};

 const agentsStore = doc.getMap<agentConfig>("agents");

 

export class MCPAgentManager {
  public mcpAgents: Record<string, MCPClientManager & agentConfig> = {};
  constructor(public store: Y.Map<agentConfig> = agentsStore) {
    this.initFromStore();
  }

  async initFromStore() {
    const iterator = yMapIterate<agentConfig>(this.store);
    for await (const [id] of iterator) {
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
    info: Partial<agentConfig> & { id: string } & Partial<AuthInfo>
  ) {
    const agentInfo = {
      name: info.name || info.id,
      created: new Date().toISOString(),
      ...(this.store.get(info.id) || {}),
      ...info,
    };

    if (this.mcpAgents[agentInfo.id]) {
      return this.mcpAgents[agentInfo.id];
    }
    return this.createAgent(agentInfo);
  }

  createAgent({
    id,
    name,
    created,
    ...authInfo
  }: Partial<agentConfig> & { id: string } & Partial<AuthInfo>) {

    agentsStore.set(id, {
      id,
      name: name || id,
      created: created || new Date().toISOString(),
    });

    const agent = new MCPClientManager(authInfo, id, "1.0.0", agentServerStore(id));

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