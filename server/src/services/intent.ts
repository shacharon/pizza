import 'dotenv/config';
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
let openai: OpenAI | null = null;
{
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
        openai = new OpenAI({ apiKey });
    }
}

export type Intent = "find_food" | "order_food" | "greeting" | "not_food";
const GREETINGS = ["hi", "hello", "hey", "שלום", "היי"];
const HUNGER_SYNS = [
    "hungry", "starving", "famished", "grab a bite", "something to eat",
    "eat", "eating", "food", "meal",
    "מה לאכול", "אני רעב", "רוצה לאכול", "איפה אוכלים", "יש משהו קרוב"
];
const FOOD_CONTEXT_SYNS = [
    "near me", "close by", "delivery", "deliver", "takeout", "take away",
    "restaurant", "menu", "order", "משלוח", "להזמין", "מסעדה", "תפריט",
    "tel aviv", "תל אביב", "tlv"
];
const FOOD_TYPES = [
    "pizza", "pizzeria", "piza", "pitza", "pitsa", "sushi", "burger", "shawarma", "falafel", "pasta", "salad",
    "פיצה", "סושי", "המבורגר", "שווארמה", "פלאפל", "פסטה", "סלט"
];

const IntentSchema = z.object({
    intent: z.enum(["find_food", "order_food", "greeting", "not_food"]),
    confidence: z.number().min(0).max(1),
    why: z.string().optional()
});

function tokenize(raw: string): Set<string> {
    const text = raw.toLowerCase().normalize("NFKC");
    const parts = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return new Set(parts);
}
function hasAnyTokens(tokens: Set<string>, terms: string[]): boolean {
    return terms.some(t => tokens.has(t.toLowerCase()));
}
function containsNumber(raw: string): boolean {
    return /\b\d+\b/.test(raw);
}

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
function scoreByRules(message: string): { intent: Intent; confidence: number; rationale?: string } {
    const tokens = tokenize(message);
    const raw = message.toLowerCase();

    const scores: Record<Intent, number> = { greeting: 0, find_food: 0, order_food: 0, not_food: 0 };

    // Order (strongest cue): "order" + (food type | "this"/"number" | digit)
    const ORDER_TERMS = ["order", "להזמין", "תזמין", "קנה", "buy", "place"];
    const SELECTION_TERMS = ["this", "number"];
    if (
        hasAnyTokens(tokens, ORDER_TERMS) &&
        (hasAnyTokens(tokens, FOOD_TYPES) || hasAnyTokens(tokens, SELECTION_TERMS) || containsNumber(raw))
    ) {
        scores.order_food = 0.75;
    }

    // Find-food cues: food types, hunger, or food context
    if (
        hasAnyTokens(tokens, FOOD_TYPES) ||
        hasAnyTokens(tokens, HUNGER_SYNS) ||
        hasAnyTokens(tokens, FOOD_CONTEXT_SYNS)
    ) {
        scores.find_food = Math.max(scores.find_food, 0.80);
    }

    // Greeting
    if (hasAnyTokens(tokens, GREETINGS)) {
        scores.greeting = 0.90;
    }

    // Pick top
    let best: Intent = "not_food";
    let conf = 0;
    for (const [k, v] of Object.entries(scores) as [Intent, number][]) {
        if (v > conf) { best = k; conf = v; }
    }
    return { intent: best, confidence: conf };
}

export async function detectIntent(message: string, signal?: AbortSignal): Promise<IntentResult> {
    const m = message.trim().toLowerCase();

    // 1) Fast, forgiving rules (broad synonyms)
    if (hasAny(m, ["hi", "hello", "hey", "שלום", "היי"])) {
        return { intent: "greeting", confidence: 0.95, source: "rules" };
    }
    if (hasAny(m, FOOD_TYPES) || hasAny(m, HUNGER_SYNS) || hasAny(m, FOOD_CONTEXT_SYNS)) {
        return { intent: "find_food", confidence: 0.62, source: "rules" };
    }
    if (hasAny(m, ["order", "להזמין"]) && (hasAny(m, FOOD_TYPES) || hasAny(m, ["this", "number"]))) {
        return { intent: "order_food", confidence: 0.70, source: "rules" };
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
    if (intent === "not_food" && confidence < 0.60 && smellsLikeFood) {
        return {
            intent: "find_food",
            confidence: 0.60,
            source: "fallback",
            rationale: `low-confidence not_food but hunger/nearby phrasing detected`
        };
    }

    return { intent, confidence, source: "llm", ...(parsed.why ? { rationale: parsed.why } : {}) };
}

/*
export async function detectIntent(message: string, signal?: AbortSignal): Promise<IntentResult> {
    const m = message.trim();
    const smellsLikeFood =
        scoreByRules(m).confidence > 0 || // any rule hit
        hasAnyTokens(tokenize(m), HUNGER_SYNS) ||
        hasAnyTokens(tokenize(m), FOOD_CONTEXT_SYNS);

    // 1) Rules first: if very confident, return immediately (cheap + fast)
    const rule = scoreByRules(m);
    if (rule.confidence >= 0.85) {
        return { intent: rule.intent, confidence: clamp01(rule.confidence), source: "rules", rationale: "strong rule match" };
    }

    // 2) LLM (only if available) → request JSON and validate with Zod
    if (openai) {
        const resp = await openai.responses.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            input: [
                { role: "system", content: `Classify BUY-FOOD messages. ${zodTextFormat(IntentSchema, "json")}` },
                { role: "user", content: m }
            ]
        }, { signal });

        const raw = (resp.output_text || "{}").trim();
        let parsedUnknown: unknown;
        try { parsedUnknown = JSON.parse(raw); } catch { parsedUnknown = null; }
        const parsed = IntentSchema.safeParse(parsedUnknown);
        if (!parsed.success) {
            // fall back to rules/heuristic
            if (smellsLikeFood) {
                return { intent: "find_food", confidence: 0.60, source: "fallback", rationale: "schema parse failed" };
            }
            return { intent: "not_food", confidence: 0.50, source: "fallback", rationale: "schema parse failed" };
        }

        let intent: Intent = parsed.data.intent;
        let confidence = parsed.data.confidence;
        confidence = clamp01(confidence);

        // 3) Soft safety: if LLM is unsure "not_food" but smells like food → nudge to find_food
        if (intent === "not_food" && confidence < 0.60 && smellsLikeFood) {
            return {
                intent: "find_food",
                confidence: 0.60,
                source: "fallback",
                rationale: "low-confidence not_food but hunger/nearby phrasing detected"
            };
        }

        return {
            intent,
            confidence,
            source: "llm",
            ...(parsed.data.why ? { rationale: parsed.data.why } : {})
        };
    }

    // 3) No LLM available → graceful fallback
    if (smellsLikeFood) {
        return { intent: "find_food", confidence: 0.66, source: "fallback", rationale: "llm disabled; hunger/context detected" };
    }
    // Use rules result if any signal exists, else default not_food
    if (rule.confidence > 0) {
        return { intent: rule.intent, confidence: clamp01(rule.confidence), source: "rules", rationale: "weak rule match" };
    }
    return { intent: "not_food", confidence: 0.50, source: "fallback", rationale: "llm disabled" };
}

function clamp01(n: number): number {
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(1, n));
}*/