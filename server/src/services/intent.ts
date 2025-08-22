import 'dotenv/config';
import OpenAI from "openai";
let openai: OpenAI | null = null;
{
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
        openai = new OpenAI({ apiKey });
    }
}

export type Intent = "find_food" | "order_food" | "greeting" | "not_food";

const HUNGER_SYNS = [
    "hungry", "starving", "famished", "grab a bite", "something to eat",
    "מה לאכול", "אני רעב", "רוצה לאכול", "איפה אוכלים", "יש משהו קרוב"
];
const FOOD_CONTEXT_SYNS = [
    "near me", "close by", "delivery", "deliver", "takeout", "take away",
    "restaurant", "menu", "order", "משלוח", "להזמין", "מסעדה", "תפריט"
];
const FOOD_TYPES = [
    "pizza", "pizzeria", "sushi", "burger", "shawarma", "falafel", "pasta", "salad",
    "פיצה", "סושי", "המבורגר", "שווארמה", "פלאפל", "פסטה", "סלט"
];

function hasAny(s: string, arr: string[]) {
    const m = s.toLowerCase();
    return arr.some(k => m.includes(k));
}

export interface IntentResult {
    intent: Intent;
    confidence: number; // 0..1
    source: "rules" | "llm" | "fallback";
    rationale?: string;
}

export async function detectIntent(message: string, signal?: AbortSignal): Promise<IntentResult> {
    const m = message.trim().toLowerCase();

    // 1) Fast, forgiving rules (broad synonyms)
    if (hasAny(m, ["hi", "hello", "hey", "שלום", "היי"])) {
        return { intent: "greeting", confidence: 0.9, source: "rules" };
    }
    if (hasAny(m, FOOD_TYPES) || hasAny(m, HUNGER_SYNS) || (hasAny(m, FOOD_CONTEXT_SYNS) && m.includes("eat"))) {
        return { intent: "find_food", confidence: 0.8, source: "rules" };
    }
    if (hasAny(m, ["order", "להזמין"]) && (hasAny(m, FOOD_TYPES) || hasAny(m, ["this", "number"]))) {
        return { intent: "order_food", confidence: 0.75, source: "rules" };
    }

    // 2) LLM fallback (compact, cheap)
    if (!openai) {
        const smellsLikeFoodEarly = hasAny(m, HUNGER_SYNS) || hasAny(m, FOOD_CONTEXT_SYNS);
        if (smellsLikeFoodEarly) {
            return { intent: "find_food", confidence: 0.66, source: "fallback", rationale: "llm disabled; hunger/context detected" };
        }
        return { intent: "not_food", confidence: 0.5, source: "fallback", rationale: "llm disabled" };
    }
    const sys = `
You classify user messages for a BUY-FOOD assistant.
Return JSON only: {"intent":"find_food|order_food|greeting|not_food","confidence":0..1,"why":"..."}.
Rules:
- "find_food": user wants places/options to buy prepared food (delivery/takeout/dine-in).
- "order_food": user wants to place an order or refers to a specific menu item/number to buy now.
- "greeting": hello/thanks/small talk.
- "not_food": recipes, cooking at home, groceries, finance, code, weather, etc.
Ambiguous hunger like "I'm starving, any ideas?" => "find_food".
Hebrew/English both. Output JSON ONLY.`;
    const resp = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
            { role: "system", content: sys },
            { role: "user", content: message }
        ],
        // keep text mode; small payload, fast
    }, { signal });

    const raw = (resp.output_text || "{}").trim();
    let parsed: { intent?: Intent; confidence?: number; why?: string } = {};
    try { parsed = JSON.parse(raw); } catch { }

    let intent = (parsed.intent as Intent) || "not_food";
    let confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

    // 3) Soft safety: if LLM says not_food with low confidence but message smells like food,
    // nudge to find_food instead of blocking.
    const smellsLikeFood = hasAny(m, HUNGER_SYNS) || hasAny(m, FOOD_CONTEXT_SYNS);
    if (intent === "not_food" && confidence < 0.66 && smellsLikeFood) {
        return {
            intent: "find_food",
            confidence: 0.66,
            source: "fallback",
            rationale: `low-confidence not_food but hunger/nearby phrasing detected`
        };
    }

    return { intent, confidence, source: "llm", ...(parsed.why ? { rationale: parsed.why } : {}) };
}
