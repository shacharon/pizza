import { z } from 'zod';
import { PlacesIntentSchema, type PlacesIntent } from './places-intent.schema.js';
import { createLLMProvider } from '../../../llm/factory.js';
import type { LLMProvider, Message } from '../../../llm/types.js';

const PromptSchema = z.object({
    intent: z.literal('find_food'),
    provider: z.literal('google_places'),
    search: z.object({
        mode: z.enum(['textsearch', 'nearbysearch', 'findplace']),
        query: z.string().optional(),  // English canonical category
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
            rankby: z.enum(['prominence', 'distance']).optional()
            // NOTE: language and region removed - will be set by orchestrator based on LanguageContext
        }).optional()
    }),
    // NEW: Canonical fields for consistent query building across languages
    canonical: z.object({
        category: z.string().optional(),     // English: "italian restaurant", "sushi", "pizza"
        locationText: z.string().optional()  // Original: "Paris", "תל אביב", "Champs-Élysées"
    }).optional(),
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

        const system = `You are an intent resolver for Google Places. Always output STRICT JSON for this schema:

{
  "intent": "find_food",
  "provider": "google_places",
  "search": {
    "mode": "textsearch" | "nearbysearch" | "findplace",
    "query": string,  // ⚠️ MUST BE ENGLISH! food/topic only (NO locations, NO open/closed)
    "target": {
      "kind": "me" | "city" | "place" | "coords",
      "city"?: string,   // Keep ORIGINAL language (Tel Aviv / תל אביב / Paris)
      "place"?: string   // Keep ORIGINAL language (Allenby Tel Aviv / Champs-Élysées Paris)
    },
    "filters"?: {
      "opennow"?: true,  // ONLY true for "open now" queries, NEVER false
      "price"?: { "min": number, "max": number }
    }
  },
  "canonical": {
    "category": string,      // ⚠️ MUST BE ENGLISH! (e.g., "italian restaurant", "sushi", "pizza")
    "locationText": string   // ORIGINAL language (e.g., "Paris", "תל אביב", "Champs-Élysées Paris")
  },
  "output": { "fields": string[], "page_size": number }
}

CRITICAL RULES (MUST FOLLOW):

1. ⚠️ "query" and "canonical.category" MUST ALWAYS BE IN ENGLISH
   - This ensures consistent Google Places results across ALL input languages
   - Examples: "italian restaurant", "sushi", "vegan pizza", "burger"
   - Translate from ANY language: French→English, Russian→English, Hebrew→English

2. ⚠️ "target" fields (city, place) and "canonical.locationText" MUST KEEP ORIGINAL LANGUAGE
   - This ensures accurate geocoding
   - Examples: "Paris", "תל אביב", "Гедере", "Champs-Élysées"

3. Extract ALL locations into target/canonical (never leave in query)
   - If street mentioned: target.kind="place", place="{street} {city}", canonical.locationText="{street} {city}"
   - If only city: target.kind="city", city="{city}", canonical.locationText="{city}"

4. Filters:
   - "open"/"פתוח"/"ouvert" → opennow: true
   - "closed"/"סגור"/"fermé" → omit opennow (closed filtering not supported by API)
   - Remove open/closed keywords from query

5. Mode selection:
   - Near-me/closest → mode:"nearbysearch"
   - Venue only (no food) → mode:"findplace"
   - Otherwise → mode:"textsearch"

6. Never hallucinate coords. Never include rankby for textsearch.`;
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

        const raw = await this.llm.completeJSON(messages, PromptSchema, { temperature: 0 });
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
