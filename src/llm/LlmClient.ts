import { OpenAI } from "openai";
import { getOrThrow } from "../shared/utils.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import logger from "../shared/logger.js";
import type { Tool } from "../mcp/Tool.js";

class LlmClient {
    private client: OpenAI;
    private model: string;

    constructor(model: string = "gpt-4o-mini") {
        this.client = new OpenAI({
            apiKey: getOrThrow("OPENAI_API_KEY"),
        });
        this.model = model;
    }

    async getResponse(messages: ChatCompletionMessageParam[], tools: Tool[]) {
        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: messages,
            tools: tools.map((tool) => tool.toOpenAiTool()),
            tool_choice: "auto",
        });
        logger.debug("Llm response: " + JSON.stringify(completion.choices[0]?.message));
        return completion.choices[0]?.message;
    }
}
export const llmClient = new LlmClient();
