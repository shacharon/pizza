import { FoodQueryDTOZ, type FoodQueryDTO } from "@api";
import { detectIntent, type Intent } from "../intent.js";
import { openai } from "../openai.client.js";

export type PipelineOk = { kind: "ok"; intent: Intent; dto: FoodQueryDTO };
export type PipelineClarify = { kind: "clarify" };
export type PipelineRefuse = { kind: "refuse" };
export type PipelineGreeting = { kind: "greeting" };
export type PipelineResult = PipelineOk | PipelineClarify | PipelineRefuse | PipelineGreeting;

const INTENT_CONFIDENCE_MIN = 0.65;

function extractJson(text: string): unknown | null {
    if (!text) return null;
    const raw = text.trim();
    // 1) Prefer fenced block content if present
    const fenceMatch = raw.match(/```(?:json)?\n([\s\S]*?)```/i);
    const candidateText = fenceMatch?.[1]?.trim() ?? raw;
    // 2) Try balanced-brace extraction of first JSON object
    const s = candidateText;
    let inString = false;
    let escape = false;
    let depth = 0;
    let start = -1;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = false; }
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
        if (ch === '}') {
            if (depth > 0) depth--;
            if (depth === 0 && start !== -1) {
                const slice = s.slice(start, i + 1);
                try { return JSON.parse(slice); } catch { /* continue scan */ }
                // keep scanning in case later object parses
                start = -1;
            }
        }
    }
    // 3) Last resort: parse full string (likely fails if prose)
    try { return JSON.parse(candidateText); } catch { return null; }
}

const FOOD_QUERY_SYS = `You extract a structured food-ordering query. Return a JSON OBJECT ONLY (no prose/markdown).
Shape (omit unknown fields):
{
  "raw": string,
  "city"?: string,
  "type"?: "pizza"|"sushi"|"burger"|"other",
  "maxPrice"?: number,
  "dietary"?: ("gluten_free"|"vegan"|"vegetarian"|"kosher"|"halal"|"none")[],
  "deliveryEtaMinutes"?: number
}` as const;

async function callLlmForQuery(message: string): Promise<unknown> {
    const resp = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
            { role: "system", content: FOOD_QUERY_SYS },
            { role: "user", content: message }
        ]
    });
    const text = resp.output_text ?? "";
    return extractJson(text);
}

export async function runChatPipeline(message: string): Promise<PipelineResult> {
    // 1) Intent gate
    const { intent, confidence } = await detectIntent(message);
    if (intent === "not_food") return { kind: "refuse" };
    if (intent === "greeting") return { kind: "greeting" };
    if (confidence < INTENT_CONFIDENCE_MIN) return { kind: "clarify" };

    // 2) LLM → JSON
    const json = await callLlmForQuery(message);
    if (!json) return { kind: "clarify" };

    // 3) Zod validate
    const parsed = FoodQueryDTOZ.safeParse(json);
    if (!parsed.success) return { kind: "clarify" };

    return { kind: "ok", intent, dto: parsed.data };
}


