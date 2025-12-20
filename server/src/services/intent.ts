import 'dotenv/config';
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { LLMProvider, Message } from "../llm/types.js";
import { createLLMProvider } from "../llm/factory.js";
const llm: LLMProvider | null = createLLMProvider();

export type Intent = "find_food" | "order_food" | "greeting" | "not_food";

// ✅ NO HARDCODED PATTERNS - Trust the LLM to understand intent in ANY language!

const IntentSchema = z.object({
    intent: z.enum(["find_food", "order_food", "greeting", "not_food"]),
    confidence: z.number().min(0).max(1),
    why: z.string().optional()
});

export interface IntentResult {
    intent: Intent;
    confidence: number; // 0..1
    source: "llm" | "fallback";
    rationale?: string;
}

export async function detectIntent(message: string, signal?: AbortSignal): Promise<IntentResult> {
    const m = message.trim();

    // Trust LLM for ALL intent detection (multilingual, context-aware)
    if (!llm) {
        // Minimal fallback when LLM is not configured
        console.warn('[Intent] LLM not configured, defaulting to find_food');
        return {
            intent: "find_food",
            confidence: 0.5,
            source: "fallback",
            rationale: "llm disabled"
        };
    }

    function messagesForIntent(m: string): Message[] {
        const system =
            `You classify user messages for a BUY-FOOD assistant.\n` +
            `Return JSON only: {"intent":"find_food|order_food|greeting|not_food","confidence":0..1,"why":"..."}.\n` +
            `Rules:\n` +
            `- "find_food": user wants places/options to buy prepared food (delivery/takeout/dine-in).\n` +
            `- "order_food": user wants to place an order or refers to a specific menu item/number to buy now.\n` +
            `- "greeting": hello/thanks/small talk.\n` +
            `- "not_food": recipes, cooking at home, groceries, finance, code, weather, etc.\n` +
            `Ambiguous hunger like "I'm starving, any ideas?" => "find_food".\n` +
            `Works in ANY language (Hebrew, English, French, Arabic, etc.). Output JSON ONLY.`;
        return [
            { role: "system", content: system },
            { role: "user", content: m }
        ];
    }

    const parsed = await llm.completeJSON(messagesForIntent(message), IntentSchema, { temperature: 0.1, timeout: 30_000 });

    return {
        intent: parsed.intent as Intent,
        confidence: parsed.confidence,
        source: "llm",
        ...(parsed.why ? { rationale: parsed.why } : {})
    };
}