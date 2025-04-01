import { OrderedFixedSizeMap } from "../shared/OrderedFixedSizeMap.js";

export type ActionRequest = ToolCallsRequest | MCPClientConnectionRequest;

export type ToolCallsRequest = {
    type: "tool_calls";
    sessionId: string;
    toolRequests: ToolCallRequest[];
};

export type ToolCallRequest = {
    toolName: string; // Todo use a toolId that is more obvious like server+toolName ?
    toolArgs: Record<string, any>;
    toolCallResult: any;
    success: boolean;
};

export type MCPClientConnectionRequest = {
    type: "mcp_client_connect";
    sessionId: string;
    clientName: string;
};

class ActionRequestStore {
    private _actionRequestCache: OrderedFixedSizeMap<string, ActionRequest>;

    constructor() {
        this._actionRequestCache = new OrderedFixedSizeMap<string, ActionRequest>(100);
    }

    get(actionId: string) {
        return this._actionRequestCache.get(actionId);
    }

    getAndDelete(actionId: string) {
        const actionRequest = this.get(actionId);
        this.delete(actionId);
        return actionRequest;
    }

    set(actionId: string, actionRequest: ActionRequest) {
        this._actionRequestCache.set(actionId, actionRequest);
    }

    delete(actionId: string) {
        this._actionRequestCache.delete(actionId);
    }
}

export const actionRequestStore = new ActionRequestStore();
