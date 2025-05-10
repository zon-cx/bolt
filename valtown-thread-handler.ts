import { createMachine, assign, setup, fromPromise } from "xstate";
import SlackApp, { ConversationsRepliesResponse } from "slack-edge";
import { azure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { fromEventAsyncGenerator } from "./iterator.ts";
import { jsonSchema, streamObject } from "ai";
import yjsActor from "https://esm.town/v/dinavinter/yjs_actor";
import { actors } from "./message.ts";
import { connectYjs, getOrCreateDoc } from "https://esm.town/v/dinavinter/doc";

export const llmResponder = fromPromise(
  async ({
    input: { history, system, prompt },
  }: {
    input: {
      history?: ConversationsRepliesResponse["messages"];
      system?: string;
      prompt?: string;
    };
  }) => {
    const threadHistory = history
      ?.filter((m) => m.text)
      .map((m) => ({
        role: m.bot_id
          ? "assistant"
          : ("user" as "system" | "user" | "assistant" | "data"),
        content: m.text!,
      }));

    // 3. Call LLM
    const { text: aiText } = await generateText({
      model: azure("gpt-4o"),
      system: system || "You are a helpful assistant in Slack.",
      messages: threadHistory,
      prompt: prompt,
      maxSteps: 10,
    });
    return aiText;
  }
);
  


app.event("assistant_thread_started", async (args: AssistantThreadStartedEvent) => {
  const actor = yjsActor(threadBootstrap.provide({
    actors:actors(args),
    actions:actions(args)
  }))
  const result = await threadMachine.provide().start({
    thread_ts: event.assistant_thread.thread_ts,
    channel_id: event.assistant_thread.channel_id,
    user_id: event.assistant_thread.user_id,
  });
  if (result && result.context && result.context.title) {
    await say({ text: `Thread created: ${result.context.title}` });
  } else {
    await say({ text: "Thread created, but no title was generated." });
  }
});

export default app; 
