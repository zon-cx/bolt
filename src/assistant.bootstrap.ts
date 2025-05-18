import { fromEventAsyncGenerator } from "@cxai/stream";
import { jsonSchema, generateObject, generateText } from "ai";
import { azure } from "@ai-sdk/azure";
import messageBuilder from "./slack.messages";
import { Communication, Messages, Session } from "./assistant";
import { ActorLogic, setup } from "xstate";

export type Bootstrap = ActorLogic<
  any,
  Communication.Event,
  Session.Input,
  any,
  Communication.Event
>;


export type Input = {
  bot: {
    botToken: string;
    botId: string;
  };
};

const bootstrap = fromEventAsyncGenerator<
  Communication.Event,
  Input,
  Communication.Event
>(async function* ({ input }) {
  yield {
    type: "prompts",
    title: `This is a message from unimplemented bootstrap, bot id: ${input.bot?.botId}`,
    prompts: [
      { title: "Template 1", message: "Hello " },
      { title: "Template 2", message: "Hello 2" },
    ],
  };
}) as unknown as Session.Bootstrap;

export default bootstrap;
