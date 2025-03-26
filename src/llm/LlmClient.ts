import { OpenAI } from "openai";
import { getOrThrow } from "../shared/utils.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

class LlmClient {
    private client: OpenAI;
    private model: string;

    constructor(model: string = "gpt-4o-mini") {
        this.client = new OpenAI({
            apiKey: getOrThrow("OPENAI_API_KEY"),
        });
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
export const llmClient = new LlmClient();
