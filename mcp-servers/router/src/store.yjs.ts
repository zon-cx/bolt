import * as Y from "yjs";
import {HocuspocusProvider} from "@hocuspocus/provider";
import {env} from "process";
import WebSocket from "ws";

// Make WebSocket available globally for the hocuspocus provider
(global as any).WebSocket = WebSocket;

const docs = new Map<string, HocuspocusProvider>();
import WebSocket from "ws";
import {HocuspocusProviderWebsocket} from "@hocuspocus/provider";

const wsProviders=new Map<string, HocuspocusProviderWebsocket>();
const wsProvider = (url: string) => {
    if (!wsProviders.has(url)) {
        wsProviders.set(url, new HocuspocusProviderWebsocket({
            url: url,
            initialDelay: 0,
            maxDelay: 1000,
            maxAttempts:4,
            onConnect: () => {
                console.log("connected to yjs websocket", url);
            },
            onStatus: (status) => {
                console.log("status to yjs websocket",url, status);
            },
            // WebSocketPolyfill: WebSocket
        }));
        // wsProviders.get(url)!.connect().catch(e=>{
        //     console.error("error connecting to yjs websocket", url, e);
        // });
    }
    return wsProviders.get(url)!;
}

export  function connectYjs(doc: Y.Doc | string, url?: string): Y.Doc {
    const document =
        typeof doc === "string"
            ? new Y.Doc({guid: doc, shouldLoad: true, gc: false})
            : doc;
    url = url || env.YJS_URL || "wss://yjs.cfapps.us10-001.hana.ondemand.com";

    if (!docs.has(document.guid)) {
        const provider = new HocuspocusProvider({
            url: url,
            document: document,
            forceSyncInterval: 4000,
            name: document.guid,
            // websocketProvider: wsProvider(url),
            onConnect: () => {
                console.log("connected to yjs", provider.document.guid);
            },
            onSynced: () => {
                console.log("synced to yjs", provider.document.guid);
            },
            onOpen: () => {
                console.log("open to yjs", provider.document.guid);
            },
            onClose: () => {
                console.log("close to yjs", provider.document.guid);
            },

            onAuthenticated(data) {
                console.log("authenticated to yjs");
            },

            onAuthenticationFailed(data) {
                console.error("authentication failed to yjs");
            },
            onOutgoingMessage(data) {
                // console.log("outgoing message to yjs");
            },
            onMessage(data) {
                // console.log("incoming message to yjs");
            },
            onUnsyncedChanges(data) {
                // console.log("unsynced changes to yjs");
            },
            onAwarenessChange(data) {
                console.log("awareness change to yjs");
            },
            onDisconnect(data) {
                console.log("yjs disconnected", data);
            },
        });

        // wsProvider.attach(provider);
        docs.set(document.guid, provider);

        provider.startSync();
        provider.document.load();

        // provider.forceSync();
        console.log("yjs started", provider.document.guid, {
            isSynced: provider.isSynced,
            isAuthenticated: provider.isAuthenticated,
            attached: provider.isAttached,
            
        });
        // provider.document.load();
    }
    return docs.get(document.guid)!.document;
}
  