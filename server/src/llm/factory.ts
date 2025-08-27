import type { LLMProvider } from "./types.js";
import { OpenAiProvider } from "./openai.provider.js";
import { AnthropicProvider } from "./anthropic.provider.js";

export function createLLMProvider(): LLMProvider | null {
    const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();

    switch (provider) {
        case "openai": {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) return null;
            return new OpenAiProvider();
        }
        case "anthropic": {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) return null;
            return new AnthropicProvider();
        }
        case "none":
        case "disabled":
            return null;
        default:
            // Unknown provider configured; disable LLM usage gracefully
            return null;
    }
}


