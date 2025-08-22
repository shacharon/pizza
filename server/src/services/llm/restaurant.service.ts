import { openai } from '../openai.client.js';
import { OPENAI_TIMEOUT_MS, RESTAURANT_CACHE_TTL_MS } from '../../controllers/constants.js';

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
    page?: number;
    limit?: number;
}

function languageInstruction(pref?: 'mirror' | 'he' | 'en'): string {
    if (pref === 'he') return 'Answer in Hebrew.';
    if (pref === 'en') return 'Answer in English.';
    return 'Mirror the user language.';
}

function buildPrompt(q: RestaurantQuery): { system: string; user: string } {
    const sys = `You return ONLY JSON. Shape: {"restaurants":[{"name":string,"address"?:string,"price"?:number,"description"?:string,"items"?:[{"name":string,"price":number}]}]}.\n- price numbers are in ILS (number only, no currency sign).\n- Include 1-2 sentence description in the requested language.\n- Up to 20 restaurants. If multiple items are relevant include them under items[].`;
    const details: string[] = [];
    if (q.type) details.push(`type: ${q.type}`);
    if (q.city) details.push(`city: ${q.city}`);
    if (typeof q.maxPrice === 'number') details.push(`maxPrice: ${q.maxPrice}`);
    const user = `${languageInstruction(q.language)}\nFind restaurants ${details.join(', ')}.`;
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
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    const { system, user } = buildPrompt(q);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    try {
        const resp = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            input: [{ role: 'system', content: system }, { role: 'user', content: user }],
            temperature: 0
        }, { signal: controller.signal });
        const raw = resp.output_text || '';
        let parsed: any = extractJsonLoose(raw) || {};
        const list: any[] = Array.isArray(parsed?.restaurants) ? parsed.restaurants : [];
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
                // keep pure restaurant without price only if no price filter
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
        cache.set(key, { value, expiresAt: now + RESTAURANT_CACHE_TTL_MS });
        return value;
    } finally {
        clearTimeout(timeout);
    }
}

// local cache store
const cache: Map<string, { value: { restaurants: RestaurantResult[]; raw: string }; expiresAt: number }> = new Map();

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

