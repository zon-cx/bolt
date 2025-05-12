/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";
import { createActor, toPromise } from "xstate";
import assistantMachine from "./assistant";
import type { MiddlewareHandler } from "hono/types";
import { jsxRenderer } from "hono/jsx-renderer";
import { env } from "process";

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

// --- Provide custom actions to the assistant ---

// --- Create the assistant actor with custom actions ---
const assistant = createActor(assistantMachine, {
  input: { bot: { botId: "hono-bot" }, thread: { id: "main" } },
});
assistant.start();

assistant.on("*", async (msg: any) => {
  if(env.LOG_LEVEL === "debug"){
    console.debug("actor-event", msg);
  }
});

// --- Hono App ---
const app = new Hono();
app.use(
  jsxRenderer((props) => <HtmxLayout {...props} />, {
    stream: true,
  }) as unknown as MiddlewareHandler
);

// --- SSE endpoint for htmx-ext-sse ---
app.get("/events", (c) => {
  console.log("sse-event");
  return streamSSE(c, async (stream) => {
    assistant.on("message", async (msg: any) => {
      await stream.writeSSE({
        event: "message",
        data: (
          <ChatBubble
            msg={{
              user: {
                name: "Assistant",
                avatar:
                  "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=facearea&w=64&h=64",
              },
              text: typeof msg.data === "string" ? msg.data : msg.data.text,
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              role: "assistant",
            }}
          />
        ),
      });
    });
    const subscribe = [
      assistant.on("status", async (msg: any) => {
        await stream.writeSSE({
          event: "status",
          data: msg.data,
        });
      }),
    ];
    subscribe.push(
      assistant.on("title", async (msg: any) => {
        await stream.writeSSE({
          event: "title",
          data: msg.data,
        });
      })
    );
    subscribe.push(
      assistant.on("prompts", async (msg: any) => {
        await stream.writeSSE({
          event: "prompts",
          data: <PromptsBar prompts={msg.data} />,
        });
      })
    );
    subscribe.push(
      assistant.on("assistant", async (msg: any) => {
        await stream.writeSSE({
          event: "message",
          data: (
            <ChatBubble
            msg={{
              user: {
                name: "Assistant",
                avatar:
                  "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=facearea&w=64&h=64",
              },
              text: typeof msg.data === "string" ? msg.data : msg.data.text,
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              role: "assistant",
            }}
          />
          ),
        });
      })
    );
    stream.onAbort(() => subscribe.forEach((s) => s.unsubscribe()));
    await toPromise(assistant);
  });
});

// --- Layout and Renderer ---
type LayoutProps = { children?: any; title?: string };
export function HtmxLayout({ children = null, title }: LayoutProps) {
  return (
    <html>
      <head>
        <title>{title || "HTMX Layout"}</title>
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
              Hono + htmx + SSE
            </span>
          </header>
          <section class="px-8 pt-6 pb-2">{children}</section>
        </main>
      </body>
    </html>
  );
}

// --- Main Page ---
app.get("/", (c) =>
  c.render(
    // <HtmxLayout title={ "Channel Simulation"} >
    <div hx-ext="sse" sse-connect="/events">
      <TitleBar title="Channel Simulation" />
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
        hx-post="/messages"
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
    // </HtmxLayout>
  )
);



// --- Post Message Route ---
app.post("/messages", async (c) => {
  const body = await c.req.parseBody();
  const text = body.text as string;
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const user = {
    name: "You",
    avatar:
      "https://images.unsplash.com/photo-1511367461989-f85a21fda167?auto=format&fit=facearea&w=64&h=64",
  };

  // Send to assistant
  assistant.send({
    type: "@message.user",
    content: text,
    role: "user",
    timestamp: Date.now().toString(),
  });

  // Wait for assistant to process and respond (simulate async)
  await new Promise((resolve) => setTimeout(resolve, 500));

  return c.html(<ChatBubble msg={{ user, text, time, role: "user" }} />);
});

serve({
  fetch: app.fetch,
  port: env.PORT ? parseInt(env.PORT) : 8080,
});
