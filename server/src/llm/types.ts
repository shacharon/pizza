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
            temperature?: number;
            timeout?: number;
        }
    ): Promise<z.infer<T>>;
}
