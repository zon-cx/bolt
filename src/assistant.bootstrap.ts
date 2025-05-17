import { fromEventAsyncGenerator } from "@cxai/stream";
import {jsonSchema, generateObject, generateText} from "ai";
import { azure } from "@ai-sdk/azure";
import messageBuilder from "./slack.messages";
import { Communication, Thread} from "./assistant";


const prompter = fromEventAsyncGenerator(async function* (): AsyncGenerator<Communication.Event> {
  
  const {text:hello} = await generateText({
    model: azure("gpt-4o"),
    system: "You are a helpful assistant in a slack channel.",
    prompt: `this is the start of the conversation, you need to say hello to the user and suggest 3 prompts for the user to choose from.
               example: Hello 🏴‍☠️! I'm Jeki your personal stylist, I can help you look your best!`,
  });
  yield {
    type: "say",
    message: {
      text: hello,
      blocks: [
        messageBuilder.textSection(hello),
        messageBuilder.divider(),

      ],
    },
  };
  
  const { object:{  title, prompts } } = await generateObject< { title:string, prompts:Communication.Prompts["prompts"]}>({
    model: azure("gpt-4o"),
    system: "You are a helpful assistant in a slack channel.",
    prompt: `this is the start of the conversation, you just said hello to user with "${hello}", suggest 3 prompts for the user to choose from - keep it related to your welcome message.
               example:{ 
                 title: "Here some prompts example to help you get started",
                 prompts: [
                   { title: "Help me decide between two dresses",
                     message: "I'm trying to decide between two dresses, which one should I wear?"
                   },
                   { title: "Help me find a matching jewlery",
                     message: "I'm trying to find a matching jewlery for my dress, can you help me?"
                   },
                   { title: "What's the best color for my skin tone?",
                     message: "I'm trying to find the best color for my skin tone?" } ] } `,
    schema: jsonSchema({
      type: "object",
      properties: { 
        title: {
          type: "string",
          description: `the title of the prompt, for example: Here some prompts example to help you get started `,
        },
        prompts: {
          type: "array",
          minItems: 3,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              message: { type: "string" },
            },
            required: ["title", "message"],
          },
        },
      },
      required: ["title", "prompts"],
    }),
  }); 

  yield { type: "prompts",  prompts, title};
});

export default prompter as unknown as  Thread.Bootstrap
