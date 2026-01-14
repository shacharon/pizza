import { z } from 'zod';
import { createHash } from 'crypto';
import { PlacesIntentSchema, type PlacesIntent } from './places-intent.schema.js';
import { createLLMProvider } from '../../../llm/factory.js';
import type { LLMProvider, Message } from '../../../llm/types.js';

const PromptSchema = z.object({
  intent: z.literal('find_food'),
  provider: z.literal('google_places'),
  search: z.object({
    mode: z.enum(['textsearch', 'nearbysearch', 'findplace']),
    query: z.string().nullable(),  // Changed to nullable to match JSON schema
    target: z.object({
      kind: z.enum(['city', 'place', 'coords', 'me']),
      city: z.string().nullable(),  // Changed to nullable
      place: z.string().nullable(),  // Changed to nullable
      coords: z.object({ lat: z.number(), lng: z.number() }).nullable()  // Changed to nullable
    }).nullable(),  // Changed to nullable to match JSON schema
    filters: z.object({
      type: z.string().nullable(),  // Changed to nullable
      keyword: z.string().nullable(),  // Changed to nullable
      price: z.object({ min: z.number(), max: z.number() }).nullable(),  // Changed to nullable
      opennow: z.boolean().nullable(),  // Changed to nullable
      radius: z.number().nullable(),  // Changed to nullable
      rankby: z.enum(['prominence', 'distance']).nullable()  // Changed to nullable
      // NOTE: language and region removed - will be set by orchestrator based on LanguageContext
    }).nullable()  // Changed to nullable
  }),
  // NEW: Canonical fields for consistent query building across languages
  canonical: z.object({
    category: z.string().nullable(),  // Changed to nullable
    locationText: z.string().nullable()  // Changed to nullable
  }).nullable(),  // Changed to nullable
  output: z.object({
    fields: z.array(z.string()).nullable(),  // Changed to nullable
    page_size: z.number().nullable()  // Changed to nullable
  }).nullable()  // Changed to nullable
});

/**
 * Static JSON Schema for PlacesIntent (Legacy Intent Service)
 * Used directly with OpenAI Structured Outputs instead of converting from Zod
 * This ensures we always have a valid root type "object"
 * 
 * Note: OpenAI Structured Outputs with strict: true requires all properties 
 * to be in 'required'. For optional fields, we use nullable types.
 */
const PLACES_INTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["find_food"] },
    provider: { type: "string", enum: ["google_places"] },
    search: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["textsearch", "nearbysearch", "findplace"] },
        query: { type: ["string", "null"] },  // Optional, so nullable (must be in required)
        target: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["city", "place", "coords", "me"] },
            city: { type: ["string", "null"] },  // Optional, so nullable
            place: { type: ["string", "null"] },  // Optional, so nullable
            coords: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    lat: { type: "number" },
                    lng: { type: "number" }
                  },
                  required: ["lat", "lng"],
                  additionalProperties: false
                },
                { type: "null" }
              ]
            }
          },
          required: ["kind", "city", "place", "coords"],  // All must be in required, use null for missing
          additionalProperties: false
        },
        filters: {
          anyOf: [
            {
              type: "object",
              properties: {
                type: { type: ["string", "null"] },
                keyword: { type: ["string", "null"] },
                price: {
                  anyOf: [
                    {
                      type: "object",
                      properties: {
                        min: { type: "number" },
                        max: { type: "number" }
                      },
                      required: ["min", "max"],
                      additionalProperties: false
                    },
                    { type: "null" }
                  ]
                },
                opennow: { type: ["boolean", "null"] },
                radius: { type: ["number", "null"] },
                rankby: {
                  anyOf: [
                    { type: "string", enum: ["prominence", "distance"] },
                    { type: "null" }
                  ]
                }
              },
              required: ["type", "keyword", "price", "opennow", "radius", "rankby"],
              additionalProperties: false
            },
            { type: "null" }
          ]
        }
      },
      required: ["mode", "query", "target", "filters"],  // All properties must be in required
      additionalProperties: false
    },
    canonical: {
      anyOf: [
        {
          type: "object",
          properties: {
            category: { type: ["string", "null"] },
            locationText: { type: ["string", "null"] }
          },
          required: ["category", "locationText"],
          additionalProperties: false
        },
        { type: "null" }
      ]
    },
    output: {
      anyOf: [
        {
          type: "object",
          properties: {
            fields: {
              anyOf: [
                {
                  type: "array",
                  items: { type: "string" }
                },
                { type: "null" }
              ]
            },
            page_size: { type: ["number", "null"] }
          },
          required: ["fields", "page_size"],
          additionalProperties: false
        },
        { type: "null" }
      ]
    }
  },
  required: ["intent", "provider", "search", "canonical", "output"],
  additionalProperties: false
} as const;

/**
 * Intent Resolver System Prompt - v3
 * Shorter, stricter version focused on core rules
 * 
 * Key improvements from v2:
 * - Removed redundant schema documentation (now enforced by Structured Outputs)
 * - Clearer language separation rules
 * - Explicit mode selection guidance
 * - No hallucinated coords or invalid rankby
 */
const INTENT_PROMPT_VERSION = "intent_v3";
const INTENT_SYSTEM_PROMPT = `You are an intent resolver for Google Places.

Return ONLY a single JSON object that matches the provided schema. No markdown, no code fences, no extra text.

Core rules:
1) search.query and canonical.category MUST be English only (food/topic only; NEVER include location or open/closed words).
2) target.city / target.place and canonical.locationText MUST keep the ORIGINAL user language (e.g., "תל אביב", "Paris", "Champs-Élysées").
3) Extract ALL location text into target + canonical.locationText. Never leave locations inside search.query.
4) If the user asks for "open now" (open/פתוח/ouvert/etc), set filters.opennow = true. Never set opennow=false.
5) Mode selection:
   - "near me / closest / around me" => search.mode="nearbysearch" and target.kind="me"
   - specific named place/address/landmark => target.kind="place" (mode textsearch unless you explicitly need findplace)
   - city name => target.kind="city"
6) Never hallucinate coords. Only output coords if the user explicitly provides them.
7) Never include rankby for textsearch.`;

// Pre-compute prompt hash for observability (SHA-256)
const INTENT_PROMPT_HASH = createHash('sha256')
  .update(INTENT_SYSTEM_PROMPT, 'utf8')
  .digest('hex');

export class PlacesIntentService {
  private readonly llm: LLMProvider | null;

  constructor() {
    this.llm = createLLMProvider();
  }

  /**
   * Normalize common place/city variants (simple heuristics, both en/he spellings).
   * Minimal normalization - LLM should preserve original city names correctly now.
   */
  private normalizeLocationToken(raw: string): string {
    const s = raw.trim();
    const lower = s.toLowerCase();
    // Minimal examples for common typos only
    const map: Record<string, string> = {
      'alenbi': 'Allenby',
      'tel aviv': 'Tel Aviv',
    };
    return map[lower] ?? s;
  }

  /**
   * Extract multiple location phrases like "in Allenby in Tel Aviv".
   * Returns stripped query and detected place and/or city (prefer place > city).
   * Currently supports simple English prepositions (in|at|near|close to) and a few Hebrew joiners.
   */
  private extractLocations(text: string): { stripped: string; place?: string | undefined; city?: string | undefined } {
    if (!text) return { stripped: text };
    const pattern = /\b(?:in|at|near|close to|on|ב|ליד|באזור)\s+([A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF\s\-']{1,80})\b/gi;
    const matches: Array<{ full: string; token: string; index: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const full = m[0] ?? '';
      const token = m[1] ?? '';
      const index = m.index ?? -1;
      if (full && token && index >= 0) {
        matches.push({ full, token: this.normalizeLocationToken(token), index });
      }
    }
    if (matches.length === 0) return { stripped: text };

    // If multiple matches, treat the last as the likely city; previous as place (if any)
    const last = matches[matches.length - 1];
    const prev = matches.length > 1 ? matches[matches.length - 2] : null;
    const city = last?.token;
    const place = prev?.token && prev.token !== city ? prev.token : undefined;

    // Strip all matched spans from the text
    let out = text;
    for (const mm of matches) {
      const idx = out.toLowerCase().indexOf(mm.full.toLowerCase());
      if (idx >= 0) {
        out = (out.slice(0, idx) + out.slice(idx + mm.full.length));
      }
    }
    out = out.replace(/\s{2,}/g, ' ').trim();
    return { stripped: out, place, city };
  }

  /**
   * Strip detected target tokens from a free-text query, also removing common
   * joiners/prepositions in English/Hebrew to keep only the food/topic words.
   */
  private stripLocationFromQuery(query: string | undefined, tokens: string[]): string {
    const q = (query ?? '').trim();
    if (!q) return '';
    let out = q;
    for (const t of tokens) {
      if (!t) continue;
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${escaped}\\b`, 'ig'), ' ');
    }
    // common joiners/preps in en/he
    out = out.replace(/\b(in|near|at|close to|ב|בתל|ליד|באזור)\b/ig, ' ');
    return out.replace(/\s{2,}/g, ' ').trim();
  }

  private targetTokens(target: PlacesIntent['search']['target'] | undefined): string[] {
    if (!target) return [];
    if (target.kind === 'city' && target.city) return [target.city];
    if (target.kind === 'place' && target.place) return [target.place];
    return [];
  }

  async resolve(text: string, language?: 'he' | 'en'): Promise<PlacesIntent> {
    if (!this.llm) {
      // Fallback: extract locations heuristically
      const { stripped, place, city } = this.extractLocations(text);
      const target = place ? { kind: 'place', place } : city ? { kind: 'city', city } : { kind: 'me' } as const;
      const intent = {
        intent: 'find_food', provider: 'google_places',
        search: {
          mode: 'textsearch',
          query: stripped,
          target,
          filters: language ? { language } : undefined
        },
        output: { fields: ['place_id', 'name', 'formatted_address', 'geometry'], page_size: 10 }
      } as const;
      return PlacesIntentSchema.parse(intent);
    }

    const system = INTENT_SYSTEM_PROMPT;
    const user = `User text: ${text}
Return only the JSON. Examples:

User: "Restaurants italiens sur les Champs-Élysées à Paris" (French)
→ { 
  "search": { 
    "mode": "textsearch", 
    "query": "italian restaurant",
    "target": { "kind": "place", "place": "Champs-Élysées Paris" }
  },
  "canonical": {
    "category": "italian restaurant",
    "locationText": "Champs-Élysées Paris"
  }
}

User: "Italian restaurants on the Champs-Élysées in Paris" (English)
→ { 
  "search": { 
    "mode": "textsearch", 
    "query": "italian restaurant",
    "target": { "kind": "place", "place": "Champs-Élysées Paris" }
  },
  "canonical": {
    "category": "italian restaurant",
    "locationText": "Champs-Élysées Paris"
  }
}

User: "מסעדות איטלקיות בתל אביב" (Hebrew)
→ { 
  "search": { 
    "mode": "textsearch", 
    "query": "italian restaurant",
    "target": { "kind": "city", "city": "תל אביב" }
  },
  "canonical": {
    "category": "italian restaurant",
    "locationText": "תל אביב"
  }
}

User: "Итальянские рестораны в Гедере" (Russian)
→ { 
  "search": { 
    "mode": "textsearch", 
    "query": "italian restaurant",
    "target": { "kind": "city", "city": "Гедере" }
  },
  "canonical": {
    "category": "italian restaurant",
    "locationText": "Гедере"
  }
}

User: "סושי בתל אביב" (Hebrew: sushi in Tel Aviv)
→ { 
  "search": { 
    "mode": "textsearch", 
    "query": "sushi",
    "target": { "kind": "city", "city": "תל אביב" }
  },
  "canonical": {
    "category": "sushi",
    "locationText": "תל אביב"
  }
}

User: "pizza near me"
→ { 
  "search": { 
    "mode": "nearbysearch", 
    "query": "pizza",
    "target": { "kind": "me" }
  },
  "canonical": {
    "category": "pizza"
  }
}`;
    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];

    // Use static JSON Schema instead of converting from Zod
    // This ensures we always have a valid root type "object"
    const raw = await this.llm.completeJSON(
      messages,
      PromptSchema,
      {
        temperature: 0,
        promptVersion: INTENT_PROMPT_VERSION,
        promptHash: INTENT_PROMPT_HASH,
        promptLength: INTENT_SYSTEM_PROMPT.length,
        stage: 'places_intent'  // For timing correlation
      },
      PLACES_INTENT_JSON_SCHEMA  // Pass static schema to avoid zod-to-json-schema issues
    );

    // FIX: Sometimes LLM returns arrays instead of strings for literal fields
    // e.g., intent: ["find_food"] instead of intent: "find_food"
    let fixedArrays = false;
    if (Array.isArray((raw as any).intent) && (raw as any).intent.length === 1) {
      console.warn('[PlacesIntentService] LLM returned intent as array, unwrapping:', (raw as any).intent);
      (raw as any).intent = (raw as any).intent[0];
      fixedArrays = true;
    }
    if (Array.isArray((raw as any).provider) && (raw as any).provider.length === 1) {
      console.warn('[PlacesIntentService] LLM returned provider as array, unwrapping:', (raw as any).provider);
      (raw as any).provider = (raw as any).provider[0];
      fixedArrays = true;
    }

    if (fixedArrays) {
      console.warn('[PlacesIntentService] Fixed LLM array output - this should not happen regularly');
    }

    let intent = PlacesIntentSchema.parse(raw);

    // GUARD: Enforce no opennow:false (Google Places API doesn't support closed filtering)
    // Note: Schema now only allows opennow: true, but we keep this guard for safety
    // in case the raw LLM output contains false before Zod validation
    const rawFilters = (raw as any)?.search?.filters;
    if (rawFilters?.opennow === false) {
      console.warn('[PlacesIntentService] ⚠️ Removing opennow:false (unsupported by Google Places API)');
      // Add warning metadata (if schema supports it)
      (intent as any).warnings = [...((intent as any).warnings ?? []), 'opennow_false_not_supported'];
    }

    // LLM should now preserve original city names correctly (no normalization needed!)

    // Post-process: if LLM didn't extract city/place but user text contains it, move it from query
    // Enhance or fill target using heuristic extraction (prefer place > city)
    const extracted = this.extractLocations(text);
    const needsLocation = intent.search.target.kind === 'me' && !intent.search.target.city && !intent.search.target.place && !intent.search.target.coords;
    if (needsLocation && (extracted.place || extracted.city)) {
      intent = PlacesIntentSchema.parse({
        ...intent,
        search: {
          ...intent.search,
          query: extracted.stripped,
          target: extracted.place ? { kind: 'place', place: extracted.place } : { kind: 'city', city: extracted.city! }
        }
      });
    } else if (intent.search.target.kind === 'city' && extracted.place && extracted.city) {
      // Upgrade to place when both are detected; append city to place for precise geocoding
      const placeWithCity = `${extracted.place} ${extracted.city}`.trim();
      intent = PlacesIntentSchema.parse({
        ...intent,
        search: {
          ...intent.search,
          query: extracted.stripped,
          target: { kind: 'place', place: placeWithCity }
        }
      });
    }

    // Safety post-processor: strip target tokens from query (and keyword if present)
    const tokens = this.targetTokens(intent.search.target).concat(
      extracted.place ? [extracted.place] : [],
      extracted.city ? [extracted.city] : []
    );
    const cleanedQuery = this.stripLocationFromQuery(intent.search.query ?? undefined, tokens);
    const cleanedFilters = intent.search.filters ? { ...intent.search.filters } : undefined;
    if (cleanedFilters && cleanedFilters.keyword) {
      cleanedFilters.keyword = this.stripLocationFromQuery(cleanedFilters.keyword, tokens);
    }
    if (cleanedQuery !== (intent.search.query ?? '') || cleanedFilters !== intent.search.filters) {
      intent = PlacesIntentSchema.parse({
        ...intent,
        search: {
          ...intent.search,
          query: cleanedQuery,
          filters: cleanedFilters
        }
      });
    }
    return intent;
  }
}
