import { FoodQueryDTOZ, type FoodQueryDTO } from "@api";
import { detectIntent, type Intent } from "../intent.js";
import { openai } from "../openai.client.js";

export type PipelineOk = { kind: "ok"; intent: Intent; dto: FoodQueryDTO };
export type PipelineClarify = { kind: "clarify" };
export type PipelineRefuse = { kind: "refuse" };
export type PipelineGreeting = { kind: "greeting" };
export type PipelineResult = PipelineOk | PipelineClarify | PipelineRefuse | PipelineGreeting;

const INTENT_CONFIDENCE_MIN = 0.6;

function extractJson(text: string): unknown | null {
    if (!text) return null;
    // Strip code fences ```json ... ``` if present
    const fenced = text.trim().replace(/^```[a-zA-Z]*\n?|```$/g, "");
    // Heuristic: find first JSON object
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    const candidate = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
    try { return JSON.parse(candidate); } catch { return null; }
}

async function callLlmForQuery(message: string): Promise<unknown> {
    const resp = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [{ role: "user", content: message }]
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


