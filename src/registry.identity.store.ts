import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { connectYjs } from "./store.yjs";
import { yMapIterate } from "@cxai/stream";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import * as Y from "yjs";
import { env } from "process";
import { ActorRefFromLogic,createActor } from "xstate";
import mcpAgent, { ServerConfig } from "./registry.mcp.client";
import { NamespacedDataStore } from "./registry.mcp.client.namespace";


export type serverConfig = {
  id: string;
  url: string;
  name?: string;
  version: string;
  type?: "streamable" | "sse";
};

export type agentConfig = {
  id: string;
  name: string;
  created: string;
};

const doc = connectYjs("@mcp.registry");

type Session = {
  id: string;
  created: string;
  auth: AuthInfo;
};

const agentsStore = doc.getMap<agentConfig>("agents");
const sessionsStore = doc.getMap<Session>("sessions");

export class MCPAgentManager {
  public mcpAgents: Record<string, ActorRefFromLogic<typeof mcpAgent> & agentConfig> = {};
  constructor(public store: Y.Map<agentConfig> = agentsStore) {
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
    const agentData = this.store.get(agentId) || {};

    const agent = agentsStore.set(agentId, {
      id: agentId,
      name: agentName,
      created: new Date().toISOString(),
      ...agentData,
    }); 

    const sessionData = sessionsStore.set(session || agentId, {
      id: session || agentId,
      auth,
      created: new Date().toISOString(),
    });

    return {
      ...agent,
      session: sessionData,
    }

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
