import { z } from "zod";
import type { LLMProvider, Message } from "./types.js";

export class AnthropicProvider implements LLMProvider {
    async complete(
        _messages: Message[],
        _opts?: { model?: string; temperature?: number; timeout?: number; }
    ): Promise<string> {
        throw new Error("AnthropicProvider is a placeholder; implementation not provided yet");
    }

    async completeJSON<T extends z.ZodTypeAny>(
        _messages: Message[],
        _schema: T,
        _opts?: { temperature?: number; timeout?: number }
    ): Promise<z.infer<T>> {
        throw new Error("AnthropicProvider is a placeholder; implementation not provided yet");
    }

    async completeStream(
        _messages: Message[],
        _onChunk: (text: string) => void,
        _opts?: { model?: string; temperature?: number; timeout?: number; traceId?: string; sessionId?: string; }
    ): Promise<string> {
        throw new Error("AnthropicProvider is a placeholder; implementation not provided yet");
    }
}


