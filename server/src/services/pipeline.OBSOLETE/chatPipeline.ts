import { FoodQueryDTOZ, type FoodQueryDTO as TFoodQueryDTO } from "@api";
import { detectIntent, type Intent } from "../intent.js";
import { foodOnlyPolicy, promptGuardPreFilter } from "./promptGuard.js";
import { createLLMProvider } from "../../llm/factory.js";
import { z } from "zod";

export type FoodQueryDTO = TFoodQueryDTO;
export type PipelineOk = { kind: "ok"; intent: Intent; dto: FoodQueryDTO };
export type PipelineClarify = { kind: "clarify" };
export type PipelineRefuse = { kind: "refuse" };
export type PipelineGreeting = { kind: "greeting" };
export type PipelineResult = PipelineOk | PipelineClarify | PipelineRefuse | PipelineGreeting;

const INTENT_CONFIDENCE_MIN = 0.55;
const CITY_SYNONYMS: Record<string, string> = {
    "ta": "tel aviv",
    "tlv": "tel aviv",
    "ת‎א": "תל אביב", // normalize edge
};

function normalizeCity(raw?: string): string | undefined {
    if (!raw) return undefined;
    const t = raw.trim().toLowerCase();
    return CITY_SYNONYMS[t] || t;
}

function deriveCityFromText(text: string): string | undefined {
    const t = text.toLowerCase();
    if (/tel\s*aviv|tlv|תל\s*אביב/.test(t)) return "tel aviv";
    if (/ashkelon|אשקלון/.test(t)) return "ashkelon";
    if (/jerusalem|ירושלים/.test(t)) return "jerusalem";
    if (/haifa|חיפה/.test(t)) return "haifa";
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
    if (/(burger|hamburger|המבורגר)/.test(s)) return "burger";
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

const llm = createLLMProvider();
async function callLlmForQuery(message: string): Promise<unknown> {
    if (!llm) {
        throw new Error('LLM provider not available');
    }
    const schema = z.any(); // pipeline will repair+validate after
    console.log('callLlmForQuery-llm-system', foodOnlyPolicy('mirror'));
    console.log('callLlmForQuery-llm-system', FOOD_QUERY_SYS);
    console.log('callLlmForQuery-llm-user', message);

    const result = await llm.completeJSON([
        { role: "system", content: foodOnlyPolicy('mirror') },
        { role: "system", content: FOOD_QUERY_SYS },
        { role: "user", content: message }
    ], schema, {
        ...(process.env.OPENAI_MODEL_EXTRACTION ? { model: process.env.OPENAI_MODEL_EXTRACTION } : {}),
        temperature: 0,
        timeout: 30_000
    });
    console.log('callLlmForQuery-llm-result', JSON.stringify(result, null, 2));
    return result;
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

    const finalDto = toLegacy(parsed.data);
    console.log('runChatPipeline-final-dto', JSON.stringify(finalDto, null, 2));
    return { kind: "ok", intent, dto: finalDto };
}


