import type { AgentState } from './state.js';
import { NLUService } from '../nlu.service.js';
import { nluPolicy } from '../nlu.policy.js';
import type { RestaurantsProvider } from '../restaurants.provider.js';
import { nluSessionService } from '../nlu-session.service.js';

export interface Graph {
    run(state: AgentState): Promise<AgentState>;
}

export function buildGraph(deps: { nlu: NLUService; provider: RestaurantsProvider }): Graph {
    const { nlu, provider } = deps;

    // Node: nlu -> extract slots
    async function nluNode(state: AgentState) {
        const res = await nlu.extractSlots({ text: state.input, language: state.language });
        const mergedSlots = nluSessionService.mergeWithSession(state.sessionId, res.slots as any);
        return {
            ...state,
            toolResults: [
                ...state.toolResults,
                { name: 'nlu', payload: res },
                { name: 'slots', payload: mergedSlots }
            ]
        };
    }

    // Node: policy -> decide action
    function policyNode(state: AgentState) {
        const nluOut = state.toolResults.find(t => t.name === 'nlu')?.payload as any;
        const mergedSlots = state.toolResults.find(t => t.name === 'slots')?.payload as any || nluOut?.slots;
        const policy = nluPolicy.decideContextual(mergedSlots, state.input, state.language);
        return { ...state, toolResults: [...state.toolResults, { name: 'policy', payload: policy }] };
    }

    // Node: fetch -> provider.search when anchor exists
    async function fetchNode(state: AgentState) {
        const nluOut = state.toolResults.find(t => t.name === 'nlu')?.payload as any;
        const mergedSlots = state.toolResults.find(t => t.name === 'slots')?.payload as any || nluOut?.slots;
        const policy = state.toolResults.find(t => t.name === 'policy')?.payload as any;
        if (policy.action !== 'fetch_results' || !mergedSlots?.city) return state;
        const dto: any = { city: mergedSlots.city };
        if (mergedSlots.type) dto.type = mergedSlots.type;
        if (typeof mergedSlots.maxPrice === 'number') dto.constraints = { maxPrice: mergedSlots.maxPrice };
        dto.language = state.language as any;
        const result = await provider.search(dto);
        // Update session memory on successful fetch
        nluSessionService.updateSession(state.sessionId, mergedSlots as any, state.input);
        return { ...state, toolResults: [...state.toolResults, { name: 'fetch', payload: result }] };
    }

    // Node: reply -> build user-facing message
    function replyNode(state: AgentState) {
        const nluOut = state.toolResults.find(t => t.name === 'nlu')?.payload as any;
        const mergedSlots = state.toolResults.find(t => t.name === 'slots')?.payload as any || nluOut?.slots;
        const policy = state.toolResults.find(t => t.name === 'policy')?.payload as any;
        const fetchRes = state.toolResults.find(t => t.name === 'fetch')?.payload as any;

        // Clarify path
        if (policy.action === 'ask_clarification') {
            const ask = policy?.message || (state.language === 'he'
                ? 'צריך עיר כדי להתחיל. באיזו עיר?'
                : state.language === 'ar'
                    ? 'أحتاج إلى اسم المدينة للبدء. ما هي المدينة؟'
                    : 'I need the city to start. Which city?');
            return { ...state, finalResponse: ask };
        }

        if (policy.action === 'clarify_not_food') {
            const ask = policy?.message || (state.language === 'he'
                ? 'זה לא נשמע כמו אוכל. מה סוג האוכל שתרצה?'
                : state.language === 'ar'
                    ? 'هذا لا يبدو طعاماً. ما نوع الطعام الذي تريده؟'
                    : "That doesn't sound like food. What cuisine are you after?");
            return { ...state, finalResponse: ask };
        }

        // Results path
        if (policy.action === 'fetch_results' && mergedSlots?.city && fetchRes) {
            const items = (fetchRes.restaurants || []).slice(0, 5)
                .map((r: any) => `${r.name} — ${r.address}${r.rating ? ` (★${r.rating})` : ''}`);
            const itemsInline = items.join('; ');
            const summary = state.language === 'he'
                ? `נמצאו ${fetchRes.restaurants.length} מקומות${mergedSlots.type ? ` (${mergedSlots.type})` : ''} ב${mergedSlots.city}. Top ${items.length}: ${itemsInline}`
                : state.language === 'ar'
                    ? `تم العثور على ${fetchRes.restaurants.length} أماكن${mergedSlots.type ? ` (${mergedSlots.type})` : ''} في ${mergedSlots.city}. أفضل ${items.length}: ${itemsInline}`
                    : `Found ${fetchRes.restaurants.length} places${mergedSlots.type ? ` (${mergedSlots.type})` : ''} in ${mergedSlots.city}. Top ${items.length}: ${itemsInline}`;
            return { ...state, finalResponse: summary };
        }

        const fallback = state.language === 'he'
            ? 'סליחה, קרתה תקלה זמנית. נסה שוב.'
            : state.language === 'ar'
                ? 'عذراً، حدث خلل مؤقت. حاول مرة أخرى.'
                : 'Sorry, something went wrong. Please try again.';
        return { ...state, finalResponse: fallback };
    }

    return {
        async run(state: AgentState) {
            const t0 = Date.now();
            const s1 = await nluNode(state);
            const s2 = policyNode(s1);
            const s3 = await fetchNode(s2);
            const s4 = replyNode(s3);
            try {
                console.log('[Graph]', {
                    sessionId: state.sessionId,
                    language: state.language,
                    tookMs: Date.now() - t0,
                    action: (s2.toolResults.find(t => t.name === 'policy')?.payload as any)?.action,
                    slots: s1.toolResults.find(t => t.name === 'slots')?.payload,
                });
            } catch { }
            return s4;
        }
    };
}


