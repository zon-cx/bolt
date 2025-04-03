import logger from "../shared/logger.js";
import { OrderedFixedSizeMap } from "../shared/OrderedFixedSizeMap.js";
import { McpSession } from "./McpSession.js";

class McpSessionStore {
    private storage: OrderedFixedSizeMap<string, McpSession>;

    constructor() {
        this.storage = new OrderedFixedSizeMap<string, McpSession>(100);
    }

    getById(mcpSessionId: string): McpSession | undefined {
        return this.storage.get(mcpSessionId);
    }

    get(userId: string, threadTs: string): McpSession | undefined {
        return this.storage.get(userId + "-" + threadTs);
    }

    new(mcpSession: McpSession) {
        if (this.storage.get(mcpSession.mcpSessionId)) {
            throw new Error("Mcp session already exists for id: " + mcpSession.mcpSessionId);
        }
        this.storage.set(mcpSession.mcpSessionId, mcpSession);
    }

    update(mcpSession: McpSession) {
        if (!this.storage.get(mcpSession.mcpSessionId)) {
            throw new Error("Mcp session not found for id: " + mcpSession.mcpSessionId);
        }
        this.storage.set(mcpSession.mcpSessionId, mcpSession);
    }

    delete(mcpSessionId: string) {
        if (!this.storage.get(mcpSessionId)) {
            logger.warn("Attempting to delete non-existing mcp session for id: " + mcpSessionId);
        }
        this.storage.delete(mcpSessionId);
    }
}

export const mcpSessionStore = new McpSessionStore();
