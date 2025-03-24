import { OpenAI } from "openai";
import { getOrThrow } from "./utils.js";
import type { ChatCompletionMessageParam, ChatCompletionSystemMessageParam } from "openai/resources/chat/completions";

class LLMClient {
    private client: OpenAI;
    private timeout: number;
    private maxRetries: number;
    private model: string;

    constructor(model: string = "gpt-4o-mini", timeout: number = 10000, maxRetries: number = 3) {
        this.client = new OpenAI({
            apiKey: getOrThrow("OPENAI_API_KEY"),
        });
        this.timeout = timeout;
        this.maxRetries = maxRetries;
        this.model = model;
    }

    // async initializeChat() {
    //     const currentDateTime = new Date().toLocaleString();
    //     const systemMessage: ChatCompletionSystemMessageParam = {
    //         role: "system",
    //         content: `
    //   #### CONTEXT
    //   Nous sommes le ${currentDateTime}.

    //   You are a friendly assistant that can help answer questions and help with tasks.
    //   `,
    //     };
    //     const inputMessages: ChatCompletionMessageParam[] = [systemMessage];

    //     try {
    //         const chatCompletion = await this.client.chat.completions.create({
    //             messages: inputMessages,
    //             model: this.model,
    //         });
    //         console.log(chatCompletion);
    //         console.log(chatCompletion.choices[0]?.message?.content);
    //         return chatCompletion.choices[0]?.message?.content || "";
    //     } catch (error) {
    //         console.error(`Error initializing chat: ${error}`);
    //         throw error;
    //     }
    // }

    async getResponse(messages: ChatCompletionMessageParam[]) {
        console.log("MESSAGES", messages);
        const currentDateTime = new Date().toLocaleString();
        const systemMessage: ChatCompletionSystemMessageParam = {
            role: "system",
            content: `
      #### CONTEXT
      Nous sommes le ${currentDateTime}.
      
      You are a friendly assistant that can help answer questions and help with tasks.
      `,
        };
        const inputMessages: ChatCompletionMessageParam[] = [systemMessage, ...messages];

        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: inputMessages,
        });
        console.log(completion);
        return completion.choices[0]?.message?.content || "";
    }

    // async getResponse(messages: ChatCompletionMessageParam[]) {
    //     try {
    //         const completion = await this.client.chat.completions.create({
    //             model: "gpt-4o-mini",
    //             messages: messages,
    //         });
    //         return completion.choices[0]?.message?.content || "";
    //     } catch (error) {
    //         console.error(`Error getting response from LLM: ${error}`);
    //         throw error;
    //     }
    // }
}

export const llmClient = new LLMClient();
