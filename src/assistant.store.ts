import type {
  AnyActorLogic,
  AnyStateMachine,
  EventObject,
  InspectionEvent,
  NonReducibleUnknown,
  ObservableActorLogic,
  Observer,
} from "xstate";
import { createActor, initialTransition, transition } from "xstate";
import * as Y from "yjs";
import { fromEventAsyncGenerator } from "@cxai/stream/xstate";
import { yArrayIterator } from "@cxai/stream/yjs";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { env } from "node:process";
import { WebsocketProvider } from "y-websocket";
const docs = new Map<string, HocuspocusProvider>();

const map = new Map<string, ReturnType<typeof createActorFromYjs>>();
export const actorsStore = new Y.Doc({
  guid: "@y-actor/store",
  collectionid: "store",
  shouldLoad: true,
  gc: false,
});
connectYjs(actorsStore);

setTimeout(() => {
  console.log(
    "actorsStore",
    JSON.stringify(actorsStore.getMap("@assistant/thread").toJSON())
  );
}, 1000);

export default function yjsActor(
  logic: AnyActorLogic,
  options?: {
    doc?: Y.Doc | string;
    input?: any;
    connect?: typeof connectYjs | false;
    logger: (...args: any[]) => void;
    onCreate?: (actor: ReturnType<typeof createActor>) => void;
    onStart?: (actor: ReturnType<typeof createActor>) => void;
  }
) {
  const { doc, input, connect, logger, onCreate, onStart } = {
    connect: connectYjs,
    logger: console.info,
    ...(options || {}),
    doc:
      typeof options?.doc === "string"
        ? new Y.Doc({
            guid: options.doc,
            collectionid: `@actors/${(logic as any).id ?? "logic"}`,
            meta: { logic: (logic as any).id ?? "logic" },
            shouldLoad: true,
            gc: true,
          })
        : !options?.doc
        ? new Y.Doc({
            guid: `@actors/${(logic as any).id ?? "logic"}`,
            collectionid: `@actors/${(logic as any).id ?? "logic"}`,
            meta: { logic: (logic as any).id ?? "logic" },
            shouldLoad: true,
            gc: true,
          })
        : options.doc,
  };

  async function start() {
    if (!map.has(doc.guid)) {
      !!connect && connect(doc);
      map.set(doc.guid, createActorFromYjs(logic, doc, input, logger));
      onCreate && onCreate(map.get(doc.guid)!);
      map.get(doc.guid)!.start();
      onStart && onStart(map.get(doc.guid)!);
    }

    return map.get(doc.guid)!;
  }

  async function send(event: EventObject) {
    const actor = await start();
    actor.send(event);
  }

  return {
    send,
    start,
    doc,
  };
}

function createActorFromYjs(
  logic: AnyActorLogic,
  doc: Y.Doc,
  input?: any,
  logger?: (...args: any[]) => void
) {
  const { persist, restoreFromEvents, restore, inspect, live } = hydrate(doc);
  const resroredState = restore();
  console.info("restored state", doc.guid, resroredState);
  const runtime = createActor(logic, {
    id: doc.guid,
    input: input,
    snapshot: resroredState as any,
    inspect,
    logger,
  });


  const inputEvents = doc.getMap<EventObject>("@input");
  const handledEvents = doc.getMap<EventObject>("@handled");
  inputEvents.observe((e) => {
    console.log("live event", e.keys.keys());
     e.keys.keys().filter((key) => inputEvents.get(key) && !handledEvents.has(key)).forEach((key) => {
      handledEvents.set(key, inputEvents.get(key)!);
      console.log("sending event", inputEvents.get(key));
      runtime.send(inputEvents.get(key));
     });
  });
  
 
  persist(runtime);

  return runtime;
}

function hydrate(doc: Y.Doc) {
  const store = actorsStore.getMap(doc.meta?.logic as string);
  return {
    restore() {
      const snapshot = store.get(doc.guid);
      console.log("restoring", doc.guid, snapshot);
      return snapshot;
    },

    restoreFromEvents(machine: AnyStateMachine) {
      let [nextState, actions] = initialTransition(machine);
      for (const event of doc.getArray<EventObject>("@events").toArray()) {
        [nextState, actions] = transition(machine, nextState, event);
      }
      return nextState;
    },

    live: fromEventAsyncGenerator(async function* ({
      emit,
    }): AsyncGenerator<EventObject> {
      const input = doc.getArray<EventObject>("@input");
      const handled = doc.getMap<EventObject>("@handled");
      async function* withId<T>(input: AsyncIterable<T>) {
        let i = 0;
        for await (const e of input) {
          console.log("live event", e);
          yield {
            id: i++,
            timestamp: Date.now(),
            ...e,
          };
          emit(e as EventObject);
        }
      }
      for await (const event of withId(yArrayIterator(input))) {
        if (!handled.has(event.id.toString())) {
          yield event;
          doc.transact(() => {
            handled.set(event.id.toString(), event);
          });
        }
      }
    }) as unknown as ObservableActorLogic<
      EventObject,
      NonReducibleUnknown,
      EventObject
    >,

    inspect: {
      next: (inspectionEvent: InspectionEvent) => {
        if (inspectionEvent.type === "@xstate.snapshot") {
          const snapshot = inspectionEvent.snapshot;
          doc.transact(() => {
            doc
              .getMap("@sessions")
              .set(
                inspectionEvent.actorRef.sessionId,
                (snapshot as any).value ?? null
              );
          });
        }
        if (inspectionEvent.type === "@xstate.event") {
          const event = inspectionEvent.event;
          const events = doc.getArray("@events");
          doc.transact(() => {
            events.push([
              {
                session: inspectionEvent.actorRef.sessionId,
                event: event,
                timestamp: Date.now(),
                id: events.length,
              },
            ]);
          });
        }
      },
      complete: () => {
        console.log("complete");
        doc.getMap("@store").set("status", "complete");
      },
    } as Observer<InspectionEvent>,

    persist(actor: ReturnType<typeof createActor>) {
      actor.subscribe((e) => {
        const persistedSnapshot = actor.getPersistedSnapshot();
        store.set(doc.guid, persistedSnapshot as any);
        console.log("persisted snapshot", doc.guid, persistedSnapshot);
        doc.transact(() => {
          const persisted: any = persistedSnapshot;
          doc
            .getMap("@store")
            .set("state", "value" in persisted ? persisted.value : null);
          doc.getMap("@store").set("event", e.event);

          const snapshotMap = doc.getMap("@snapshot");
          Object.entries(persistedSnapshot).forEach(([key, value]) => {
            console.log("snapshot persist", key);
            snapshotMap.set(key, value);
          });
        });
      });

      actor.on("*", (e) => {
        doc.getArray("@output").push([e]);
      });
    },
  };
}


export function connectYjs(doc: Y.Doc | string): Y.Doc {
  const document =
    typeof doc === "string"
      ? new Y.Doc({ guid: doc, shouldLoad: true, gc: false })
      : doc;
 
  if (!docs.has(document.guid)) {
    const provider = new HocuspocusProvider({
      url: env.YJS_URL || "wss://yjs.cfapps.us10-001.hana.ondemand.com",
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
