import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { connectYjs } from "./store.yjs";
import { yMapIterate } from "@cxai/stream";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import * as Y from "yjs";
import { env } from "process";
import { ActorRefFromLogic,createActor } from "xstate";
import mcpAgent, { ServerConfig } from "./registry.mcp.client.xstate";
import { NamespacedDataStore } from "./registry.mcp.client.namespace";


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

const agentsStore = doc.getMap<agentConfig>("agents");

export class MCPAgentManager {
  public mcpAgents: Record<string, ActorRefFromLogic<typeof mcpAgent> & agentConfig> = {};
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
      const mcpActor = createActor(mcpAgent, {
        input: {
           auth,
           sessionId,
           store:doc.getMap<ServerConfig>(agentId),
           dataStore:new NamespacedDataStore()
        },
      });
      mcpActor.start();
      this.mcpAgents[agentId] = Object.assign(mcpActor, agentsStore.get(agentId)!);
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
