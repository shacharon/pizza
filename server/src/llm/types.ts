import { z } from "zod";

export type Message = {
    role: "system" | "user" | "assistant";
    content: string;
};

export interface LLMProvider {
    completeJSON<T extends z.ZodTypeAny>(
        messages: Message[],
        schema: T,
        opts?: {
            model?: string;
            temperature?: number;
            timeout?: number;
        }
    ): Promise<z.infer<T>>;

    complete(
        messages: Message[],
        opts?: {
            model?: string;
            temperature?: number;
            timeout?: number;
        }
    ): Promise<string>;

    /**
     * Phase 4: Stream completion with chunk callback
     * Returns full text when done
     */
    completeStream(
        messages: Message[],
        onChunk: (text: string) => void,
        opts?: {
            model?: string;
            temperature?: number;
            timeout?: number;
            traceId?: string;
            sessionId?: string;
        }
    ): Promise<string>;
}
