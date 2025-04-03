import logger from "./logger.js";
import { OrderedFixedSizeMap } from "./OrderedFixedSizeMap.js";

export type UserSession = {
    userId: string;
    mcpSessionId?: string;
    mcpServerAuths: Record<string, McpServerAuth>;
};

export type McpServerAuth = {
    serverUrl: string;
    serverName: string;
    mcpCodeVerifier?: string;
    mcpTokens?: string;
    mcpClientInformation?: string;
};

class UserSessionStore {
    private _userSessionStorage: OrderedFixedSizeMap<string, UserSession>;

    constructor() {
        this._userSessionStorage = new OrderedFixedSizeMap<string, UserSession>(200);
    }

    get(key: string) {
        return this._userSessionStorage.get(key);
    }

    new(key: string, value: UserSession) {
        if (this._userSessionStorage.get(key)) {
            throw new Error("User session already exists for key: " + key);
        }
        this._userSessionStorage.set(key, value);
    }

    update(key: string, value: UserSession) {
        if (!this._userSessionStorage.get(key)) {
            throw new Error("User session not found for key: " + key);
        }
        this._userSessionStorage.set(key, value);
    }

    delete(key: string) {
        if (!this._userSessionStorage.get(key)) {
            logger.warn("Attempting to delete non-existing user session for key: " + key);
        }
        this._userSessionStorage.delete(key);
    }
}

export const userSessionStore = new UserSessionStore();
