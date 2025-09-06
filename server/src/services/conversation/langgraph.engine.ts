import type { ConversationEngine } from './engine.interface.js';
import type { AgentState } from './state.js';
import { NLUService } from '../nlu.service.js';
import { nluPolicy } from '../nlu.policy.js';
import { getRestaurantsProvider } from '../restaurants.provider.js';

// Deterministic engine: NLU -> Policy -> Provider
export class LangGraphEngine implements ConversationEngine {
    private nlu = new NLUService();
    private provider = getRestaurantsProvider();

    async invoke(state: AgentState): Promise<AgentState> {
        const language = state.language;
        const text = state.input || '';

        if (!text.trim()) {
            const msg = language === 'he'
                ? 'היי! מה בא לך לאכול היום?'
                : language === 'ar'
                    ? 'مرحباً! ماذا تريد أن تأكل اليوم؟'
                    : 'Hi! What would you like to eat today?';
            return { ...state, finalResponse: msg };
        }

        try {
            const nluRes = await this.nlu.extractSlots({ text, language });
            const policy = nluPolicy.decideContextual(nluRes.slots, text, language);

            // Ask for clarification if needed
            if (policy.action === 'ask_clarification') {
                const ask = policy.message || (language === 'he'
                    ? 'צריך עיר כדי להתחיל. באיזו עיר?'
                    : language === 'ar'
                        ? 'أحتاج إلى اسم المدينة للبدء. ما هي المدينة؟'
                        : 'I need the city to start. Which city?');
                return { ...state, finalResponse: ask };
            }

            // Not food clarification
            if (policy.action === 'clarify_not_food') {
                const ask = policy.message || (language === 'he'
                    ? 'זה לא נשמע כמו אוכל. מה סוג האוכל שתרצה?'
                    : language === 'ar'
                        ? 'هذا لا يبدو طعاماً. ما نوع الطعام الذي تريده؟'
                        : "That doesn't sound like food. What cuisine are you after?");
                return { ...state, finalResponse: ask };
            }

            // Fetch results when anchor exists
            if (policy.action === 'fetch_results' && nluRes.slots.city) {
                const dto: any = { city: nluRes.slots.city };
                if (nluRes.slots.type) dto.type = nluRes.slots.type;
                if (typeof nluRes.slots.maxPrice === 'number') dto.constraints = { maxPrice: nluRes.slots.maxPrice };
                dto.language = language as any;

                const result = await this.provider.search(dto);
                const items = (result.restaurants || []).slice(0, 5)
                    .map((r: any) => `${r.name} — ${r.address}${r.rating ? ` (★${r.rating})` : ''}`);

                // Single-line friendly summary (UI-safe: avoids newlines)
                const itemsInline = items.join('; ');
                const summary = language === 'he'
                    ? `נמצאו ${result.restaurants.length} מקומות${nluRes.slots.type ? ` (${nluRes.slots.type})` : ''} ב${nluRes.slots.city}. Top ${items.length}: ${itemsInline}`
                    : language === 'ar'
                        ? `تم العثور على ${result.restaurants.length} أماكن${nluRes.slots.type ? ` (${nluRes.slots.type})` : ''} في ${nluRes.slots.city}. أفضل ${items.length}: ${itemsInline}`
                        : `Found ${result.restaurants.length} places${nluRes.slots.type ? ` (${nluRes.slots.type})` : ''} in ${nluRes.slots.city}. Top ${items.length}: ${itemsInline}`;

                return { ...state, finalResponse: summary };
            }

            // Fallback
            const fallback = language === 'he'
                ? 'סליחה, קרתה תקלה זמנית. נסה שוב.'
                : language === 'ar'
                    ? 'عذراً، حدث خلل مؤقت. حاول مرة أخرى.'
                    : 'Sorry, something went wrong. Please try again.';
            return { ...state, finalResponse: fallback };
        } catch (e: any) {
            const msg = language === 'he'
                ? 'סליחה, קרתה תקלה זמנית. נסה שוב.'
                : language === 'ar'
                    ? 'عذراً، حدث خلل مؤقت. حاول مرة أخرى.'
                    : 'Sorry, something went wrong. Please try again.';
            return { ...state, finalResponse: msg };
        }
    }
}


