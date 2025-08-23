import { FoodQueryDTOZ, type FoodQueryDTO } from "@api";
import { detectIntent, type Intent } from "../intent.js";
import { openai } from "../openai.client.js";
import { foodOnlyPolicy, promptGuardPreFilter } from "./promptGuard.js";

export type PipelineOk = { kind: "ok"; intent: Intent; dto: FoodQueryDTO };
export type PipelineClarify = { kind: "clarify" };
export type PipelineRefuse = { kind: "refuse" };
export type PipelineGreeting = { kind: "greeting" };
export type PipelineResult = PipelineOk | PipelineClarify | PipelineRefuse | PipelineGreeting;

const INTENT_CONFIDENCE_MIN = 0.55;
const CITY_SYNONYMS: Record<string, string> = {
    "ta": "tel aviv",
    "tlv": "tel aviv",
    "ת\u200eא": "תל אביב", // normalize edge
};

function normalizeCity(raw?: string): string | undefined {
    if (!raw) return undefined;
    const t = raw.trim().toLowerCase();
    return CITY_SYNONYMS[t] || t;
}

function deriveCityFromText(text: string): string | undefined {
    const t = text.toLowerCase();
    if (/tel\s*aviv|tlv|תל\s*אביב/.test(t)) return "tel aviv";
    return undefined;
}

function coerceNumber(n: unknown): number | undefined {
    if (typeof n === 'number') return Number.isFinite(n) ? n : undefined;
    if (typeof n === 'string') {
        const v = Number(n.replace(/[^0-9.]/g, ''));
        return Number.isFinite(v) ? v : undefined;
    }
    return undefined;
}

function mapTypeSynonym(t?: unknown): FoodQueryDTO["type"] | undefined {
    if (typeof t !== 'string') return undefined;
    const s = t.toLowerCase().trim();
    if (/(pizza|piza|pitza|pitsa|פיצה)/.test(s)) return "pizza";
    if (/(sushi|סושי)/.test(s)) return "sushi";
    if (/(burger|המבורגר)/.test(s)) return "burger";
    return "other";
}

function toLegacy(dto: FoodQueryDTO): any {
    const out: any = { ...dto } as any;
    const c: any = (dto as any).constraints || {};
    if (c.maxPrice !== undefined) out.maxPrice = c.maxPrice;
    if (Array.isArray(c.dietary)) out.dietary = c.dietary;
    if (c.deliveryEtaMinutes !== undefined) out.deliveryEtaMinutes = c.deliveryEtaMinutes;
    return out;
}

function localRepair(rawJson: unknown, message: string): unknown {
    if (!rawJson || typeof rawJson !== 'object') {
        return { raw: message };
    }
    const src = rawJson as Record<string, unknown>;
    const out: any = { raw: typeof src.raw === 'string' && src.raw.trim() ? src.raw.trim() : message };
    if (typeof src.city === 'string') out.city = normalizeCity(src.city);
    out.city ||= deriveCityFromText(message);
    const mappedType = mapTypeSynonym(src.type);
    if (mappedType) out.type = mappedType;
    const maxPrice = coerceNumber(src.maxPrice);
    if (maxPrice !== undefined) out.maxPrice = maxPrice;
    const eta = coerceNumber(src.deliveryEtaMinutes);
    if (eta !== undefined) out.deliveryEtaMinutes = eta;
    if (Array.isArray(src.dietary)) {
        out.dietary = src.dietary.filter((x) => typeof x === 'string');
    }
    return out;
}

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
  "deliveryEtaMinutes"?: number,
  "cards"?: { title: string, subtitle?: string, url: string }[]
}` as const;

async function callLlmForQuery(message: string): Promise<unknown> {
    const resp = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
            { role: "system", content: foodOnlyPolicy('mirror') },
            { role: "system", content: FOOD_QUERY_SYS },
            { role: "user", content: message }
        ]
    });
    const text = resp.output_text ?? "";
    return extractJson(text);
}

export async function runChatPipeline(message: string): Promise<PipelineResult> {
    // 0) PromptGuard pre-filter
    const pre = promptGuardPreFilter(message, 'mirror');
    if (!pre.allow) {
        return { kind: "clarify" };
    }
    // 1) Intent gate
    const { intent, confidence } = await detectIntent(message);
    if (intent === "not_food") return { kind: "refuse" };
    if (intent === "greeting") return { kind: "greeting" };
    if (confidence < INTENT_CONFIDENCE_MIN) return { kind: "clarify" };

    // Short-circuit order intents to avoid over-clarifying
    if (intent === "order_food" && confidence >= INTENT_CONFIDENCE_MIN) {
        return { kind: "ok", intent, dto: { raw: message } as any };
    }

    // 2) LLM → JSON
    const json = await callLlmForQuery(message);
    if (!json) {
        if (intent === "order_food") return { kind: "ok", intent, dto: { raw: message } as any };
        // Heuristic fallback: build DTO from message without LLM JSON
        const repaired = localRepair({}, message);
        const probe = FoodQueryDTOZ.safeParse(repaired);
        if (probe.success) {
            return { kind: "ok", intent, dto: toLegacy(probe.data) };
        }
        return { kind: "clarify" };
    }

    // 3) Zod validate with local repair
    let parsed = FoodQueryDTOZ.safeParse(json);
    if (!parsed.success) {
        const repaired = localRepair(json, message);
        parsed = FoodQueryDTOZ.safeParse(repaired);
        if (!parsed.success) return { kind: "clarify" };
    }

    return { kind: "ok", intent, dto: toLegacy(parsed.data) };
}


