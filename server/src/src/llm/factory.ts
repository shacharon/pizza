import type { LLMProvider } from "./types.js";
import { OpenAiProvider } from "./openai.provider.js";
import { AnthropicProvider } from "./anthropic.provider.js";

let cached: LLMProvider | null | undefined; // undefined = not initialized
export function createLLMProvider(): LLMProvider | null {
    if (cached) return cached;          // cached is a provider
    if (cached === null) return null;   // only if we explicitly locked it

    const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();

    if (provider === "openai") {
        if (!process.env.OPENAI_API_KEY) return null; // DO NOT set cached=null
        cached = new OpenAiProvider();
        return cached;
    }

    if (provider === "anthropic") {
        if (!process.env.ANTHROPIC_API_KEY) return null; // DO NOT set cached=null
        cached = new AnthropicProvider();
        return cached;
    }

    // for disabled providers, lock null
    cached = null;
    return null;
}

// Optional: for tests/hot-reload
export function resetLLMProviderCacheForTests() {
    cached = undefined;
}
