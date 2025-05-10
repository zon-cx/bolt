import { type ConversationsRepliesResponse } from "@slack/web-api";
import { AnyStateMachine, fromPromise } from "xstate";
import { generateText } from "ai";
import { azure } from "@ai-sdk/azure";
import { asyncBatchEvents, asyncEventGenerator, fromAIElementStream, fromAIEventCallback, fromAIEventStream, pipeToAI } from "@cxai/stream";

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
  
  export  const aiElementStream = fromAIElementStream({
    model: azure("gpt-4o"),
    temperature: 0.9,
  })
  
  
  
  // type AssistantPrompt = Parameters<ThreadStartedArgs["setSuggestedPrompts"]>[0]["prompts"][0]
  
  export  function  withAi (machine: AnyStateMachine): AnyStateMachine {
    return machine.provide({
        actors: {
            stream: asyncEventGenerator,
            batch: asyncBatchEvents,
            aiElementStream: fromAIElementStream({
                model: azure("gpt-4o"),
                temperature: 0.9,
            }),
            aiStream: fromAIEventStream({
                model: azure("gpt-4o"),
                temperature: 0.9,
            }),
            aiCallback: fromAIEventCallback({
                model: azure("gpt-4o"),
                temperature: 0.9,
            }),
            aiPipe: pipeToAI({
                model: azure("gpt-4o"),
                temperature: 0.9,
            }),
        }
    });
  }


