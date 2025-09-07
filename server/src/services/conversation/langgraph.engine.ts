import type { ConversationEngine } from './engine.interface.js';
import type { AgentState } from './state.js';
import { NLUService } from '../nlu.service.js';
import { getRestaurantsProvider } from '../restaurants.provider.js';
import { buildGraph } from './graph.manager.js';

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
            const graph = buildGraph({ nlu: this.nlu, provider: this.provider });
            const out = await graph.run(state);
            return out;
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


