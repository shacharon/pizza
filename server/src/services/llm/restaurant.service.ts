import { OPENAI_TIMEOUT_MS, RESTAURANT_CACHE_TTL_MS } from '../../controllers/constants.js';
import { InMemoryCacheAgent } from '../../store/inMemoryCacheAgent.js';
import { createLLMProvider } from '../../llm/factory.js';
import { z } from 'zod';

export type MenuItem = { name: string; price: number };
export type RestaurantResult = {
    name: string;
    address?: string;
    description?: string;
    items?: MenuItem[];
};

export interface RestaurantQuery {
    type?: string;
    city?: string;
    maxPrice?: number;
    language?: 'mirror' | 'he' | 'en';
    userText?: string;
    page?: number;
    limit?: number;
}

function detectLangFromText(sample?: string): 'he' | 'en' {
    if (!sample) return 'en';
    // Basic detection: Hebrew Unicode range wins
    if (/[\u0590-\u05FF]/.test(sample)) return 'he';
    return 'en';
}

function languageInstruction(pref?: 'mirror' | 'he' | 'en', sample?: string): string {
    if (pref === 'he') return 'Answer in Hebrew.';
    if (pref === 'en') return 'Answer in English.';
    const lang = detectLangFromText(sample);
    return lang === 'he' ? 'Answer in Hebrew.' : 'Answer in English.';
}

// In-memory cache instance (can be swapped for Redis adapter later)
const cache = new InMemoryCacheAgent();
const llm = createLLMProvider();

function generateFallbackRestaurants(q: RestaurantQuery): RestaurantResult[] {
    const city = q.city || 'Tel Aviv';
    const type = q.type || 'other';

    const fallbackData: Record<string, RestaurantResult[]> = {
        pizza: [
            { name: "Domino's Pizza", address: `15 Dizengoff St, ${city}`, description: "Popular pizza chain with fresh ingredients", items: [{ name: "Margherita Pizza", price: 52 }, { name: "Pepperoni Pizza", price: 65 }] },
            { name: "Pizza Hut", address: `28 Ben Yehuda St, ${city}`, description: "International pizza chain", items: [{ name: "Supreme Pizza", price: 75 }, { name: "Cheese Pizza", price: 48 }] }
        ],
        burger: [
            { name: "McDonald's", address: `42 Rothschild Blvd, ${city}`, description: "World famous burger chain", items: [{ name: "Big Mac", price: 45 }, { name: "Cheeseburger", price: 25 }] },
            { name: "Moses", address: `18 Allenby St, ${city}`, description: "Israeli burger chain with fresh meat", items: [{ name: "Moses Burger", price: 55 }, { name: "BBQ Burger", price: 62 }] }
        ],
        sushi: [
            { name: "Japanika", address: `33 Ibn Gabirol St, ${city}`, description: "Popular sushi chain in Israel", items: [{ name: "Salmon Roll", price: 12 }, { name: "Tuna Sashimi", price: 15 }] },
            { name: "Meshi", address: `7 Frishman St, ${city}`, description: "Fresh sushi and Japanese cuisine", items: [{ name: "California Roll", price: 10 }, { name: "Tempura Roll", price: 14 }] }
        ],
        other: [
            { name: "Aroma Cafe", address: `25 Dizengoff St, ${city}`, description: "Israeli coffee chain with light meals", items: [{ name: "Shakshuka", price: 35 }, { name: "Cappuccino", price: 12 }] },
            { name: "Greg Cafe", address: `11 King George St, ${city}`, description: "Popular cafe chain", items: [{ name: "Breakfast Plate", price: 42 }, { name: "Latte", price: 14 }] }
        ]
    };

    return (fallbackData[type] || fallbackData['other']) as RestaurantResult[];
}

function buildPrompt(q: RestaurantQuery): { system: string; user: string } {
    const sys = `You are a restaurant finder for Israel. Return ONLY JSON with this exact format:
{
  "restaurants": [
    {
      "name": "Restaurant Name",
      "address": "Full Street Address, City",
      "description": "Brief description",
      "items": [
        {"name": "Menu Item", "price": 45}
      ]
    }
  ]
}

CRITICAL REQUIREMENTS:
- ALWAYS return 8-12 restaurants (never empty!)
- Use REAL Israeli restaurant names: McDonald's, Domino's, Aroma, Greg, Japanika, Moses, etc.
- ALL addresses must include street name + city
- Prices in ILS (whole numbers only)
- Each restaurant needs 2-3 menu items

REALISTIC PRICES:
Pizza: 45-85, Burgers: 35-65, Sushi: 8-15/piece, Drinks: 8-15, Sides: 12-25`.trim();

    let user = `Find popular restaurants`;
    if (q.city) {
        user += ` in ${q.city}`;
    }
    if (q.type) {
        user += ` serving ${q.type}`;
    }
    if (typeof q.maxPrice === "number") {
        user += ` under ${q.maxPrice} ILS`;
    }

    user += `. Include both chains and local favorites.
${languageInstruction(q.language, q.userText)}
Return complete JSON with all required fields.`;

    return { system: sys, user };
}


export async function getRestaurants(q: RestaurantQuery): Promise<{ restaurants: RestaurantResult[]; raw: string }> {
    // Simple in-memory TTL cache with normalized key
    const norm = {
        t: (q.type || '').toLowerCase().trim(),
        c: (q.city || '').toLowerCase().trim(),
        m: typeof q.maxPrice === 'number' ? q.maxPrice : -1,
        l: q.language || 'mirror'
    };
    const key = JSON.stringify(norm);
    const hit = await cache.get<{ restaurants: RestaurantResult[]; raw: string }>(key);
    if (hit) return hit;

    const { system, user } = buildPrompt(q);
    try {
        if (!llm) {
            throw new Error('LLM provider not available');
        }
        const schema = z.object({
            restaurants: z.array(z.object({
                name: z.string(),
                address: z.string().optional(),
                description: z.string().optional(),
                price: z.number().optional(),
                items: z.array(z.object({ name: z.string(), price: z.number() })).optional()
            }))
        });

        console.log('getRestaurants-llm-system', system);
        console.log('getRestaurants-llm-user', user);
        const result = await llm.completeJSON([
            { role: 'system', content: system },
            { role: 'user', content: user }
        ], schema, {
            ...(process.env.OPENAI_MODEL_RESTAURANTS ? { model: process.env.OPENAI_MODEL_RESTAURANTS } : {}),
            temperature: 0,
            timeout: OPENAI_TIMEOUT_MS
        });
        const raw = JSON.stringify(result);
        const list: any[] = Array.isArray((result as any)?.restaurants) ? (result as any).restaurants : [];
        console.log('getRestaurants-llm-count', list.length);

        // If LLM returned no restaurants, use fallback data
        if (!list.length) {
            console.log('getRestaurants: LLM returned no restaurants, using fallback data');
            const fallbackRestaurants = generateFallbackRestaurants(q);
            const fallbackRaw = JSON.stringify({ restaurants: fallbackRestaurants });
            const value = { restaurants: fallbackRestaurants, raw: fallbackRaw };
            await cache.set(key, value, RESTAURANT_CACHE_TTL_MS / 1000);
            console.log('getRestaurants-fallback-count', fallbackRestaurants.length);
            return value;
        }
        // Map + filter by maxPrice deterministically
        const maxPrice = typeof q.maxPrice === 'number' ? q.maxPrice : undefined;
        const filtered: RestaurantResult[] = [];
        for (const r of list) {
            if (!r || typeof r.name !== 'string') continue;
            const name = r.name;
            const address = r.address;
            const description = r.description;
            if (Array.isArray(r.items) && r.items.length) {
                const items = r.items.filter((it: any) => typeof it?.name === 'string' && typeof it?.price === 'number')
                    .filter((it: any) => maxPrice === undefined || it.price <= maxPrice)
                    .map((it: any) => ({ name: it.name, price: it.price }));
                if (items.length) filtered.push({ name, address, description, items });
            } else if (typeof r.price === 'number') {
                if (maxPrice === undefined || r.price <= maxPrice) filtered.push({ name, address, description, items: [{ name, price: r.price }] });
            } else {
                if (maxPrice === undefined) filtered.push({ name, address, description });
            }
        }
        // Deduplicate by name+address and sort by min price then name
        const dedupMap = new Map<string, RestaurantResult>();
        for (const r of filtered) {
            const key2 = `${(r.name || '').toLowerCase().trim()}|${(r.address || '').toLowerCase().trim()}`;
            if (!dedupMap.has(key2)) dedupMap.set(key2, r);
        }
        const restaurantsAll = Array.from(dedupMap.values())
            .sort((a, b) => {
                const pa = Array.isArray(a.items) && a.items.length ? Math.min(...a.items.map(i => i.price)) : Number.MAX_SAFE_INTEGER;
                const pb = Array.isArray(b.items) && b.items.length ? Math.min(...b.items.map(i => i.price)) : Number.MAX_SAFE_INTEGER;
                if (pa !== pb) return pa - pb;
                return (a.name || '').localeCompare(b.name || '');
            });
        const page = q.page ?? 0;
        const limit = q.limit ?? 20;
        const start = page * limit;
        const restaurants = restaurantsAll.slice(start, start + limit);
        const value = { restaurants, raw };
        await cache.set(key, value, RESTAURANT_CACHE_TTL_MS / 1000);
        return value;
    } finally {
        // nothing
    }
}
export function isValidRestaurantsOutput(raw: string, q: RestaurantQuery, restaurants: RestaurantResult[]): boolean {
    // Bound sizes
    if (restaurants.length > 100) return false;
    for (const r of restaurants) {
        if (!r || typeof r.name !== 'string' || r.name.trim().length === 0) return false;
        if (typeof r.description === 'string' && /```|<script|<code>/i.test(r.description)) return false;
    }
    return true;
}

// local cache store

function extractJsonLoose(text: string): any | null {
    if (!text) return null;
    const raw = text.trim();
    const fence = raw.match(/```(?:json)?\n([\s\S]*?)```/i);
    const candidate = fence?.[1]?.trim() ?? raw;
    try { return JSON.parse(candidate); } catch { }
    const s = candidate; let depth = 0; let start = -1; let inStr = false; let esc = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inStr) { if (esc) { esc = false; } else if (ch === '\\') { esc = true; } else if (ch === '"') { inStr = false; } continue; }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') { if (depth === 0) start = i; depth++; }
        else if (ch === '}') { if (depth > 0) depth--; if (depth === 0 && start !== -1) { const slice = s.slice(start, i + 1); try { return JSON.parse(slice); } catch { } start = -1; } }
    }
    return null;
}

