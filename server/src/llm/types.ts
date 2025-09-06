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
}
