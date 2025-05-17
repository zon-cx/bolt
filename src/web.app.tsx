/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { stream, streamSSE } from "hono/streaming";
import {
  createActor,
  EventObject,
  fromCallback,
  InspectedEventEvent,
  InspectionEvent,
  NonReducibleUnknown,
  toPromise,
} from "xstate";
import assistantMachine, { Communication, Messages } from "./assistant";
import yjsActor, { actorsStore, connectYjs } from "./assistant.store";
import { jsxRenderer } from "hono/jsx-renderer";
import { env } from "process";
import {
  fromAsyncEventEmitter,
  fromEventAsyncGenerator,
  yArrayIterator,
  yMapIterate,
} from "@cxai/stream";
import * as Y from "yjs";
import message from "./assistant.message";
// Helper to lazily create / retrieve an assistant actor backed by Yjs for a given thread id
function getAssistant(threadId: string) {
  const doc = connectYjs(`@assistant/${threadId}`);
  const remoteAssistant = fromCallback<
    Messages.Event,
    NonReducibleUnknown,
    Communication.Emitted | Messages.Event
  >(function ({ sendBack, receive, emit }) {
    async function asyncListener() {
      for await (const event of yArrayIterator(
        doc.getArray<Communication.Emitted>("@output")
      )) {
        console.log("remote event", event);
        sendBack(event);
        emit(event);
      }
    }
    asyncListener().catch(console.error);
    // asyncMessages().catch(console.error);
    console.log(
      "remote assistant",
      threadId,
      doc.getMap("@store").toJSON(),
      doc.getArray<EventObject>("@output").toJSON(),
      doc.getMap("@snapshot").toJSON()
    );
    receive(async (event) => {
      console.log("receive", event);
      doc.getArray<Messages.Event>("@input").push([event]);
    });
  });
  return createActor(remoteAssistant).start();
}

// --- Hono App ---
const app = new Hono();
app.use(
  jsxRenderer(
    ({ title, children }: { children?: any; title?: string }) => (
      <html>
        <head>
          <title>{title || "Channel Simulation"}</title>
          <meta
            hx-preserve="true"
            name="viewport"
            content="width=device-width, initial-scale=1"
          />
          <script
            hx-preserve="true"
            src="https://unpkg.com/htmx.org@2.0.4"
          ></script>
          <script
            hx-preserve="true"
            src="https://unpkg.com/htmx-ext-sse@2.2.3/sse.js"
          ></script>
          <script
            hx-preserve="true"
            src="https://unpkg.com/idiomorph@0.3.0/dist/idiomorph-ext.min.js"
          ></script>
          <script src="https://cdn.jsdelivr.net/npm/iconify-icon@2.1.0/dist/iconify-icon.min.js"></script>
          <script
            hx-preserve="true"
            src="https://unpkg.com/htmx-ext-head-support@2.0.2"
          ></script>
          <script
            hx-preserve="true"
            src="https://unpkg.com/@tailwindcss/browser@4"
          ></script>
        </head>
        <body
          hx-ext="head-support"
          class="bg-gradient-to-br from-indigo-100 to-slate-200 min-h-screen"
        >
          <main class="max-w-2xl mx-auto mt-10 bg-white shadow-xl rounded-2xl p-0 overflow-hidden">
            {/* Header */}
            <header class="flex items-center justify-between px-8 py-5 bg-gradient-to-r from-indigo-500 to-indigo-400 text-white shadow">
              <div class="flex items-center gap-3">
                <iconify-icon icon="lucide:users" class="w-7 h-7 text-white" />
                <span class="text-2xl font-bold tracking-tight">Channel</span>
              </div>
              <span class="rounded-full bg-white/20 px-3 py-1 text-sm font-medium">
                Channel Simulation
              </span>
            </header>
            <section class="px-8 pt-6 pb-2">{children}</section>
          </main>
        </body>
      </html>
    ),
    {
      stream: true,
    }
  )
);

app.get("/nav/:thread", async (c) =>
  streamSSE(c, async (stream) => {
    const threadId = c.req.param("thread") || "main";
    const threadsMap = actorsStore.getMap("@assistant/thread");

    // Helper to (re)render thread navigation bar
    const sendThreads = async () => {
      await stream.writeSSE({
        event: "threads",
        data: (
          <div class="mb-4 flex flex-wrap gap-2 sticky top-0 bg-white z-10">
            {Array.from(threadsMap.keys()).map((id) => (
              <a
                key={id}
                hx-get={`/?thread=${id}`}
                class={`px-3 py-1 rounded-full text-sm font-medium shadow-sm transition ${
                  id === threadId
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }`}
              >
                {id.replace("@assistant/", "")}
              </a>
            ))}
          </div>
        ),
      });
    };

    // Initial list
    await sendThreads();

    // Observe Yjs map for changes
    const threadsObserver = () => {
      sendThreads();
    };

    threadsMap.observe(threadsObserver);
  })
);

// --- SSE endpoint for htmx-ext-sse ---

// --- Main Page ---
app.get("/", (c) => {
  return c.render(
    <div hx-ext="sse" sse-connect={`/threads?active=main`}>
      <div
        class="mb-4 flex flex-wrap gap-2"
        id="threads"
        sse-swap="thread"
        hx-swap="beforeend"
      />

      <TitleBar title="Channel Simulation" />
      <div id="thread" hx-swap="outerHTML" />
    </div>
  );
});

app.get("/threads", (c) =>
  streamSSE(c, async (stream) => {
    const active = c.req.param("active") || "main";
    const returned = {} as Record<string, boolean>;
    const threadsMap = actorsStore.getMap("@assistant/thread");
    for await (const [id, value] of yMapIterate(threadsMap)) {
      if (stream.aborted) break;
      if (returned[id]) continue; 
      await stream.writeSSE({
        event: "thread",
        data: (
          <a
            key={id}
            hx-post={`/${id}/select`}
            hx-target="#threads"
            hx-trigger="click"
            hx-swap="innerHTML"
            class={`cursor-pointer hover:bg-indigo-50 focus:bg-indigo-100 px-3 py-1 rounded-full text-sm font-medium shadow-sm transition bg-indigo-500 text-white data-[active]:bg-slate-200 data-[active]:text-slate-700 data-[active]:hover:bg-slate-300  `}
            data-active={false}
          >
            {id.replace("@assistant/", "")}
          </a>
        ),
      });
      returned[id] = true;
    }
  })
);
app.post("/@assistant/:thread/select", (c) => {
  const threadId = c.req.param("thread") || "main";
  const threadsMap = actorsStore.getMap("@assistant/thread");
  return c.html(<div
    hx-swap="beforeend"
    sse-swap="thread"
    id="threads"
    class="mb-4 flex flex-wrap gap-2 sticky top-0 bg-white z-10"
  >
    {Array.from(threadsMap.keys()).map((id) => (
     `@assistant/${threadId}` === id ? <a
        key={id}
        hx-get={`/${id}`}
        hx-target="#thread"
        hx-trigger="load"
        hx-swap="outerHTML"
        class={`cursor-pointer hover:bg-indigo-50 focus:bg-indigo-100 px-3 py-1 rounded-full text-sm font-medium shadow-sm transition bg-indigo-500 text-white data-[active]:bg-slate-200 data-[active]:text-slate-700 data-[active]:hover:bg-slate-300  `}
        data-active={true} 
      >
        {id.replace("@assistant/", "")}
      </a> : <a
        key={id}
        hx-post={`/${id}/select`}
        hx-target="#threads"
        hx-trigger="click"
        hx-swap="outerHTML"
        class={`cursor-pointer hover:bg-indigo-50 focus:bg-indigo-100 px-3 py-1 rounded-full text-sm font-medium shadow-sm transition  text-slate-700 bg-slate-300  `}
        data-active={false}
        >
        {id.replace("@assistant/", "")}
      </a>
    ))}
  </div>);
});

app.get("/@assistant/:thread", async (c) => {
  const threadId = c.req.param("thread");
  return c.html(
    <div
      hx-ext="sse"
      sse-connect={`/@assistant/${threadId}/messages`}
      id="thread"
      hx-swap="outerHTML"
    >
      <StatusBar />
      <PromptsBar />

      <div
        id="messages"
        sse-swap="message"
        hx-swap="beforebegin"
        class="mt-4 min-h-[300px] max-h-[400px] overflow-y-auto pr-2 flex flex-col-reverse gap-2"
      ></div>
      <form
        class="flex gap-2 mt-6 bg-slate-50 rounded-xl p-3 shadow-inner"
        hx-post={`/@assistant/${threadId}/messages`}
        hx-swap="beforeend"
        hx-target="#messages"
      >
        <input
          type="text"
          name="text"
          required
          class="flex-1 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white text-slate-800 shadow"
          placeholder="Type your message..."
        />
        <button
          type="submit"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold shadow transition flex items-center gap-2"
        >
          <iconify-icon icon="lucide:send" class="w-5 h-5" />
          Send
        </button>
      </form>
    </div>
  );
});

app.get("/@assistant/:thread/messages", async (c) =>
  streamSSE(c, async (stream) => {
    const threadId = c.req.param("thread");
    const assistant = await getAssistant(threadId);

    // assistant.on("@message.*", async ({content, role, timestamp}) => {
    //   console.log("render message", content, role, timestamp);
    //   await stream.writeSSE({
    //     event: "message",
    //     data: renderMessage({content, role, timestamp, avatar: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=facearea&w=64&h=64", name: "Assistant"})
    //   });
    // });

    assistant.on("status", async (msg: any) => {
      await stream.writeSSE({
        event: "status",
        data: msg.data,
      });
    });

    assistant.on("title", async (msg: any) => {
      await stream.writeSSE({
        event: "title",
        data: msg.data,
      });
    });
    assistant.on("prompts", async (msg: any) => {
      await stream.writeSSE({
        event: "prompts",
        data: <PromptsBar prompts={msg.data.prompts} />,
      });
    });

    assistant.on(
      "@message.user",
      async ({ content, role, timestamp, user }) => {
        console.log(threadId, "triggering message", content, role, timestamp);
        await stream.writeSSE({
          event: "message",
          id: timestamp,
          data: (
            <ChatBubble
              msg={{
                user: {
                  name: user,
                  avatar:
                    "https://images.unsplash.com/photo-1511367461989-f85a21fda167?auto=format&fit=facearea&w=64&h=64",
                },
                text: content,
                time: new Date(timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                role: role,
              }}
            />
          ),
        });
      }
    );

    assistant.on(
      "@message.assistant",
      async ({ content, role, timestamp, user }) => {
        console.log(
          threadId,
          "triggering message",
          content,
          role,
          timestamp,
          user
        );
        await stream.writeSSE({
          event: "message",
          data: (
            <ChatBubble
              msg={{
                user: {
                  name: user,
                  avatar:
                    "https://images.unsplash.com/photo-1511367461989-f85a21fda167?auto=format&fit=facearea&w=64&h=64",
                },
                text: content,
                time: new Date(timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                role: role,
              }}
            />
          ),
        });
      }
    );
    assistant.on("@message.interupt", async (msg: any) => {
      console.log("interupt", msg);
      await stream.writeSSE({
        event: "message",
        data: <ChatBubble msg={{ user:'You', text:msg.content, time:new Date(msg.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }), role: "system" }} />,
      });
    });
    stream.onAbort(() => {
      console.log("stream aborted");
      assistant.stop();
    });
    await toPromise(assistant);
  })
);

// --- Post Message Route ---
app.post("/@assistant/:thread/messages", async (c) => {

  const threadId = c.req.param("thread") || "main";
  const doc = connectYjs(`@assistant/${threadId}`);
  const input = doc.getMap<Messages.Event>("@input");
  const body = await c.req.parseBody();
  const text = body.text as string;

  console.log("pushing interupt", text, doc.guid, "@input", input.toJSON());
  input.set(Date.now().toString(), {
    type: "@message.interupt",
    role: "system",
    content: text,
    timestamp: Date.now().toString(),
    user: "interuptor",

  });

});

function ChatBubble({ msg }: { msg: any }) {
  const isAssistant = msg.role === "assistant";
  return (
    <div
      class={`flex items-end gap-3 ${
        isAssistant ? "flex-row-reverse" : ""
      } mb-2`}
    >
      <img
        src={msg.user.avatar}
        alt={msg.user.name}
        class="w-9 h-9 rounded-full border-2 border-indigo-300 shadow"
      />
      <div
        class={`max-w-[70%] px-4 py-2 rounded-2xl shadow text-base ${
          isAssistant
            ? "bg-indigo-100 text-indigo-900"
            : "bg-slate-100 text-slate-800"
        }`}
        style={{
          borderBottomRightRadius: isAssistant ? 0 : "1.5rem",
          borderBottomLeftRadius: isAssistant ? "1.5rem" : 0,
        }}
      >
        <div class="font-semibold text-sm mb-1 flex items-center gap-2">
          {msg.user.name}
          <span class="text-xs text-slate-400">{msg.time}</span>
        </div>
        <div>{msg.text}</div>
      </div>
    </div>
  );
}

function StatusBar({ status }: { status?: string }) {
  return (
    <div
      id="status"
      class="text-xs text-slate-500 mb-2"
      sse-swap="status"
      hx-swap="innerHTML"
    >
      {status}
    </div>
  );
}
function TitleBar({ title }: { title?: string }) {
  return (
    <div
      id="title"
      class="text-lg font-semibold mb-2"
      sse-swap="title"
      hx-swap="innerHTML"
    >
      {title}
    </div>
  );
}
function PromptsBar({ prompts }: { prompts?: any[] }) {
  prompts ??= [];
  return (
    <div
      id="prompts"
      class="mb-2 flex gap-2 flex-wrap"
      sse-swap="prompts"
      hx-swap="innerHTML"
    >
      {prompts &&
        prompts.length > 0 &&
        prompts.map((p, i) => (
          <button
            key={i}
            class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs border border-indigo-200 hover:bg-indigo-100 transition shadow-sm font-medium"
          >
            {p.title}
          </button>
        ))}
    </div>
  );
}

serve({
  fetch: app.fetch,
  port: env.PORT ? parseInt(env.PORT) : 8080,
});
