import { OpenAI } from "openai";
import { getOrThrow } from "../shared/utils.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import logger from "../shared/logger.js";
import type { Tool } from "../mcp/Tool.js";

class LlmClient {
    private _client: OpenAI;
    private _model: string;

    constructor() {
        this._client = new OpenAI({
            apiKey: getOrThrow("OPENAI_API_KEY"),
        });
        this._model = getOrThrow("OPENAI_MODEL");
    }

    async getResponse(messages: ChatCompletionMessageParam[], tools: Tool[] = []) {
        const completion = await this._client.chat.completions.create({
            model: this._model,
            messages: messages,
            tools: tools.map((tool) => tool.toOpenAiTool()),
            tool_choice: "auto",
        });
        logger.debug("Llm response: " + JSON.stringify(completion.choices[0]?.message));
        return completion.choices[0]?.message;
    }
}
export const llmClient = new LlmClient();
