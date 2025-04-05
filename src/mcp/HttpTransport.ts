import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import logger from "../shared/logger.js";
import { auth, type OAuthClientProvider, UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

/**
 * Client transport for Streamable HTTP: this will connect to a server using either
 * standard HTTP request/response or Server-Sent Events for receiving messages.
 */
export class HttpClientTransport implements Transport {
    private _started = false;
    private _url: URL;
    private _abortController?: AbortController;

    private _requestInit?: RequestInit;
    private _authProvider?: OAuthClientProvider;

    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;

    constructor(url: URL, opts?: { requestInit?: RequestInit; authProvider?: OAuthClientProvider }) {
        this._url = url;
        this._requestInit = opts?.requestInit;
        this._authProvider = opts?.authProvider;
    }

    private async _commonHeaders(): Promise<HeadersInit> {
        const headers: HeadersInit = {
            Accept: "application/json",
            "Content-Type": "application/json",
        };

        if (this._authProvider) {
            const tokens = await this._authProvider.tokens();
            if (tokens) {
                headers["Authorization"] = `Bearer ${tokens.access_token}`;
            }
        }

        return headers;
    }

    public start = async (): Promise<void> => {
        if (this._started) {
            throw new Error("HttpClientTransport already started");
        }

        this._started = true;
        this._abortController = new AbortController();

        await this.send({
            jsonrpc: "2.0",
            id: "123",
            method: "ping",
        });
    };

    public close = async (): Promise<void> => {
        console.log("-- HttpClientTransport close -- ");
        this._abortController?.abort();
        this.onclose?.();
    };

    /**
     * Call this method after the user has finished authorizing via their user agent and is redirected back to the MCP client application. This will exchange the authorization code for an access token, enabling the next connection attempt to successfully auth.
     */
    public finishAuth = async (authorizationCode: string): Promise<void> => {
        if (!this._authProvider) {
            throw new UnauthorizedError("No auth provider");
        }

        const result = await auth(this._authProvider, {
            serverUrl: this._url,
            authorizationCode,
        });
        if (result !== "AUTHORIZED") {
            throw new UnauthorizedError("Failed to authorize");
        }
    };

    public send = async (message: JSONRPCMessage): Promise<void> => {
        logger.debug("HttpClientTransport send message: " + JSON.stringify(message));
        try {
            const commonHeaders = await this._commonHeaders();
            const headers = new Headers({
                ...commonHeaders,
                ...this._requestInit?.headers,
            });
            const init = {
                ...this._requestInit,
                method: "POST",
                headers,
                body: JSON.stringify(message),
                signal: this._abortController?.signal,
            };

            const response = await fetch(this._url, init);
            logger.debug("HttpClientTransport senT response: " + response.status);
            if (!response.ok) {
                console.log("response status: " + response.status, this._authProvider);
                if (response.status === 401 && this._authProvider) {
                    console.log("HttpClientTransport send response: 401");
                    const result = await auth(this._authProvider, {
                        serverUrl: this._url,
                    });
                    console.log("HttpClientTransport send response: 401 result: " + result);
                    if (result !== "AUTHORIZED") {
                        throw new UnauthorizedError();
                    }
                    console.log("sending message", message);
                    return this.send(message);
                }

                const text = await response.text().catch(() => null);
                throw new Error(`Error POSTing to endpoint (HTTP ${response.status}): ${text}`);
            }

            const allMessages = await response.json().catch(() => []);
            logger.debug("HttpClientTransport all messages: " + JSON.stringify(allMessages));
            (Array.isArray(allMessages) ? allMessages : [allMessages]).map((message) => {
                this.onmessage?.(JSONRPCMessageSchema.parse(message));
            });
        } catch (error) {
            this.onerror?.(error as Error);
            throw error;
        }
    };
}
