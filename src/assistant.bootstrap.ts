import { fromEventAsyncGenerator } from "@cxai/stream";
import {jsonSchema, generateObject, generateText} from "ai";
import { azure } from "@ai-sdk/azure";
import messageBuilder from "./slack.messages";
import { Communication, Messages, Thread} from "./assistant";
import { setup } from "xstate";

const bootstrap = fromEventAsyncGenerator(async function* ({
    input,
  }: {
    input: Thread.Input;
  }) {
    yield {
      type: "prompts",
      title: `This is a message from unimplemented bootstrap, bot id: ${input.bot?.botId}`,
      prompts: [
        { title: "Template 1", message: "Hello " },
        { title: "Template 2", message: "Hello 2" },
      ],
    };
  }) as unknown as Thread.Bootstrap;
   
   
export default bootstrap;