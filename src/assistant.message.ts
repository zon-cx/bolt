import { fromEventAsyncGenerator } from "@cxai/stream";
import {  z } from "zod";
import { generateText,Schema} from "ai";
import { azure } from "@ai-sdk/azure";
import { generateObject } from "ai";
import {Communication,  Messages} from "./assistant";

type MessageInput={
  schema?:z.ZodTypeAny | Schema<Record<string, any>>,
  prompt?: string
} & Messages.Input
 
 const message = fromEventAsyncGenerator(async function* ({input: {prompt, messages, context}}:{input: MessageInput}): AsyncGenerator<Communication.Event> {

   yield {
    type: "status",
    status: "generating..."
  }
  await new Promise(resolve => setTimeout(resolve, 5));

   const schema=z.object({
       text: z.string()
    })
  const {object:say} = await generateObject<z.infer<typeof schema>>({
    model: azure("gpt-4o"),
    system: "You are a helpful assistant, respond to the user's message in the requested schema format.",
    messages: messages,
    schema:schema,
    prompt
  }) 

  yield {
    type: "say",
    message: say.text
  } 

  const {text} = await generateText({
    model: azure("gpt-4o"),
    system: "suggest a title for the conversation.",
    prompt: `the conversation """${JSON.stringify({messages, context,prompt, latestResponse: await say})}"""  `,
  })

  yield {
    type: "title",
    title:text
  } 


  return "done"
}) ;


export default message as unknown as Messages.Handler