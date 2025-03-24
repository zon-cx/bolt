import { OpenAI } from "openai";
import { getOrThrow } from "./utils.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

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

    async getResponse(messages: ChatCompletionMessageParam[]) {
        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: messages,
        });
        return completion.choices[0]?.message?.content || "";
    }
}
export const llmClient = new LLMClient();
