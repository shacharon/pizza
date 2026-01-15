import { DynamicTool } from 'langchain/tools';
import { NLUService } from '../nlu.service.js';
import { nluPolicy } from '../nlu.policy.js';
import { getRestaurantsProvider } from '../restaurants.provider.js';

export function buildTools() {
    const nlu = new NLUService();
    const provider = getRestaurantsProvider();

    const nluTool = new DynamicTool({
        name: 'nlu_parse',
        description: 'Extract food query slots from user text. Input JSON: { "text": string, "language": "he|en|ar" }',
        func: async (input: string) => {
            try {
                const { text, language } = JSON.parse(input || '{}');
                const res = await nlu.extractSlots({ text, language: (language as 'he' | 'en' | 'ar') || 'he' });
                const policy = nluPolicy.decide(res.slots, res.language, res.confidence);
                return JSON.stringify({ nlu: res, policy });
            } catch (e: any) {
                return JSON.stringify({ error: e?.message || 'nlu_parse failed' });
            }
        }
    });

    const foodSearchTool = new DynamicTool({
        name: 'food_search',
        description: 'Search restaurants. Input JSON: { "city": string, "type"?: string, "maxPrice"?: number, "language"?: "he|en|ar" }',
        func: async (input: string) => {
            try {
                const parsed = JSON.parse(input || '{}');
                let { city, type, maxPrice, language } = parsed;
                if (!city) return JSON.stringify({ error: 'city is required' });
                const dto: any = { city };
                if (type) dto.type = type;
                if (typeof maxPrice === 'number') dto.constraints = { maxPrice };
                if (language) dto.language = language as any;
                const result = await provider.search(dto);
                const items = (result.restaurants || []).slice(0, 5).map((r: any) => `${r.name} — ${r.address}${r.rating ? ` (★${r.rating})` : ''}`);
                return JSON.stringify({
                    summary: `Found ${result.restaurants.length} places. Top ${items.length}:`,
                    items,
                    nextPageToken: result.meta?.nextPageToken || null,
                    enrichedTopN: result.meta?.enrichedTopN || 0,
                    source: result.meta?.source || 'google',
                });
            } catch (e: any) {
                return JSON.stringify({ error: e?.message || 'food_search failed' });
            }
        }
    });

    return [nluTool, foodSearchTool];
}


