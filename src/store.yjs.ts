import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
const docs = new Map<string, HocuspocusProvider>();



export function connectYjs(doc: Y.Doc | string, url?: string): Y.Doc {
    const document =
      typeof doc === "string"
        ? new Y.Doc({ guid: doc, shouldLoad: true, gc: false })
        : doc;
   
    if (!docs.has(document.guid)) {
      const provider = new HocuspocusProvider({
        url: url || "wss://yjs.cfapps.us10-001.hana.ondemand.com",
        document: document,
        forceSyncInterval: 1000,
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
  