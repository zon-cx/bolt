import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { MCPClientManager } from "./registry.mcp.client";
import { connectYjs } from "./store.yjs";
import { yMapIterate } from "@cxai/stream";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import * as Y from "yjs";
import { env } from "process";

export const mcpAgents: Record<string, MCPClientManager> = {};

export type serverConfig = {
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

const doc = connectYjs("@mcp.registry");
const agentServerStore = (agentId: string): Y.Map<serverConfig> => {
  return doc.getMap<serverConfig>(`${agentId}`);
};

const agentsStore = doc.getMap<agentConfig>("agents");

export class MCPAgentManager {
  public mcpAgents: Record<string, MCPClientManager & agentConfig> = {};
  constructor(public store: Y.Map<agentConfig> = agentsStore) {
    // this.initFromStore();
  }

  async initFromStore() {
    const iterator = yMapIterate<agentConfig>(this.store);
    for await (const [id] of iterator) {
      const config = this.store.get(id);
      // if (!config) continue;
      // this.init(config);
    }
  }

  init({
    session,
    auth,
    id,
  }: {
    session?: string;
    auth: AuthInfo;
    id?: string;
    name?: string;
  }) {
    const agentId = id || (auth?.extra?.sub as string) || "default";
    const agentName = (auth?.extra?.name as string) || agentId;
    const sessionId = session || agentId;
    const agentData = this.store.get(agentId) || {};
    agentsStore.set(agentId, {
      id: agentId,
      name: agentName,
      created: new Date().toISOString(),
      ...agentData,
    });

    if (!this.mcpAgents[agentId]) {
      const mcpStore = doc.getMap<serverConfig>(agentId);

      mcpStore.set("store", {
        id: "store",
        url: "https://store-mcp.val.run/mcp",
        name: "store",
        version: "1.0.0",
      });

      env.MCP_REGISTRY_URL &&
        mcpStore.set("registry", {
          id: "registry",
          url: `${env.MCP_REGISTRY_URL}/${agentId}`,
          name: "registry",
          version: "1.0.0",
        });

      // @ts-ignore
      const agent = new MCPClientManager({
        auth,
        session: sessionId,
        // @ts-ignore
        store: mcpStore,
        ...this.store.get(agentId)!,
      });

      this.mcpAgents[agentId] = Object.assign(agent, agentsStore.get(agentId)!);
    }

    return this.mcpAgents[agentId]!;
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
