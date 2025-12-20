import { z } from 'zod';
import { PlacesIntentSchema, type PlacesIntent } from './places-intent.schema.js';
import { createLLMProvider } from '../../../llm/factory.js';
import type { LLMProvider, Message } from '../../../llm/types.js';

const PromptSchema = z.object({
    intent: z.literal('find_food'),
    provider: z.literal('google_places'),
    search: z.object({
        mode: z.enum(['textsearch', 'nearbysearch', 'findplace']),
        query: z.string().optional(),
        target: z.object({
            kind: z.enum(['city', 'place', 'coords', 'me']),
            city: z.string().optional(),
            place: z.string().optional(),
            coords: z.object({ lat: z.number(), lng: z.number() }).optional()
        }),
        filters: z.object({
            type: z.string().optional(),
            keyword: z.string().optional(),
            price: z.object({ min: z.number(), max: z.number() }).optional(),
            opennow: z.boolean().optional(),
            radius: z.number().optional(),
            rankby: z.enum(['prominence', 'distance']).optional(),
            language: z.enum(['he', 'en']).optional(),
            region: z.string().optional()
        }).optional()
    }),
    output: z.object({
        fields: z.array(z.string()).optional(),
        page_size: z.number().optional()
    }).optional()
});

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

        const system = `You are an intent resolver for Google Places. Always output STRICT JSON for this schema:\n\n{\n  "intent": "find_food",\n  "provider": "google_places",\n  "search": {\n    "mode": "textsearch" | "nearbysearch" | "findplace",\n    "query": string,                     // food/topic only (NO locations)\n    "target": {\n      "kind": "me" | "city" | "place" | "coords",\n      "city"?: string,                   // e.g., "Tel Aviv"\n      "place"?: string,                  // e.g., "Azrieli Tel Aviv" | "Marina Tel Aviv" | "Allenby Tel Aviv"\n      "coords"?: { "lat": number, "lng": number }\n    },\n    "filters"?: {\n      "language"?: "he" | "en",\n      "opennow"?: boolean,              // use 'opennow' key (not openNow)\n      "price"?: { "min": number, "max": number }\n    }\n  },\n  "output": { "fields": string[], "page_size": number }\n}\n\nRules:\n- Extract ANY city/place from the text into target.* (never leave it inside "query").\n- If a street or landmark is present, set target.kind="place" and include the city (e.g., "Allenby Tel Aviv").\n- If user implies near-me/closest -> mode:"nearbysearch".\n- If the text is ONLY a venue (no food/topic) -> mode:"findplace".\n- Otherwise -> "textsearch".\n- If no location given -> target.kind:"me".\n- "query" MUST contain only the food/topic (e.g., "vegan pizza", "gluten-free burgers").\n- Prefer "city" for general city names (Tel Aviv, Ashkelon); prefer "place" for specific venues/streets.\n- Never hallucinate coords.\n- Do not include rankby for textsearch.\n- Keep language within allow-list.`;
        const user = `User text: ${text}\nLanguage: ${language ?? 'he'}\nReturn only the JSON. Examples:\nUser: "vegan pizza in Tel Aviv"\n→ { "search": { "mode": "textsearch", "query": "vegan pizza", "target": { "kind": "city", "city": "Tel Aviv" } } }\n\nUser: "פיצה באשקלון"\n→ { "search": { "mode": "textsearch", "query": "פיצה", "target": { "kind": "city", "city": "אשקלון" } } }\n\nUser: "פיצה في أشكلون" (Arabic city in mixed query)\n→ { "search": { "mode": "textsearch", "query": "פיצה", "target": { "kind": "city", "city": "أشكلون" } } }\n\nUser: "open burger places at the Marina Tel Aviv"\n→ { "search": { "mode": "findplace", "query": "burger", "target": { "kind": "place", "place": "Marina Tel Aviv" }, "filters": { "opennow": true } } }\n\nUser: "pizza near me"\n→ { "search": { "mode": "nearbysearch", "query": "pizza", "target": { "kind": "me" } } }`;
        const messages: Message[] = [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ];

        const raw = await this.llm.completeJSON(messages, PromptSchema, { temperature: 0 });
        let intent = PlacesIntentSchema.parse(raw);

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
        const cleanedQuery = this.stripLocationFromQuery(intent.search.query, tokens);
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
