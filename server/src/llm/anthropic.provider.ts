import { z } from "zod";
import type { LLMProvider, Message } from "./types.js";

export class AnthropicProvider implements LLMProvider {
    async completeJSON<T extends z.ZodTypeAny>(
        _messages: Message[],
        _schema: T,
        _opts?: { temperature?: number; timeout?: number }
    ): Promise<z.infer<T>> {
        throw new Error("AnthropicProvider is a placeholder; implementation not provided yet");
    }
}


