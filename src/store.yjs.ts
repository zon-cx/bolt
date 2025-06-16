import * as Y from "yjs";
import {HocuspocusProvider} from "@hocuspocus/provider";
import {env} from "process";

const docs = new Map<string, HocuspocusProvider>();
import WebSocket from "ws";
import {HocuspocusProviderWebsocket} from "@hocuspocus/provider";


export function connectYjs(doc: Y.Doc | string, url?: string): Y.Doc {
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
            // websocketProvider: new HocuspocusProviderWebsocket({
            //     url: url,
            //     initialDelay: 0,
            //     maxDelay: 1000,
            //     onConnect: () => {
            //         console.log("connected to yjs websocket", url);
            //     },
            //     onStatus: (status) => {
            //         // console.log("status to yjs websocket",url, status);
            //     },
            //     WebSocketPolyfill: WebSocket
            // }),
            name: document.guid,
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
                console.log("disconnect to yjs");
            },
        });

        provider.connect();
        provider.startSync();

        provider.document.load();
        docs.set(document.guid, provider);
    }
    return docs.get(document.guid)!.document;
}
  