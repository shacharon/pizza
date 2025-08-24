import type { SessionAgent } from '../../store/types.js';
import { isValidRestaurantsOutput, getRestaurants } from '../llm/restaurant.service.js';
import { ChatReply, ResSchema } from '../../controllers/schemas.js';
import { z } from 'zod';
import { MESSAGES } from '../../controllers/constants.js';
import { promptGuardPreFilter } from '../pipeline/promptGuard.js';
import { AgentState } from '../../agent/states.js';
import { createInitialNode, reduce } from '../../agent/reducer.js';
import { runChatPipeline } from '../pipeline/chatPipeline.js';
import type { ChatAction } from '@api';
import { pickHandler, OrderFoodHandler } from '../handlers/intentHandlers.js';
import { InMemoryQuoteService } from '../adapters/quoteService.inmemory.js';

export type HandleMessageBody = {
    message?: string;
    patch?: Record<string, unknown>;
    language?: 'mirror' | 'he' | 'en';
    page?: number;
    limit?: number;
};

function slugify(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function mapRestaurantsToVendors(restaurants: any[]): any[] {
    const vendors: any[] = [];
    restaurants.forEach((r: any, idx: number) => {
        if (Array.isArray(r.items) && r.items.length) {
            r.items.forEach((it: any, j: number) => {
                if (typeof it?.price === 'number') {
                    vendors.push({ id: `v_${slugify(r.name)}_${idx}_${j}`, name: r.name, address: r.address ?? undefined, price: it.price, itemName: it.name, description: r.description, distanceMinutes: 0, rating: undefined });
                }
            });
        } else {
            vendors.push({ id: `v_${slugify(r.name)}_${idx}`, name: r.name, address: r.address ?? undefined, price: typeof r.price === 'number' ? r.price : undefined, itemName: undefined, description: r.description, distanceMinutes: 0, rating: undefined });
        }
    });
    return vendors;
}

export class ChatService {
    constructor(
        private sessionAgent: SessionAgent,
        private restaurantService: typeof getRestaurants
    ) { }

    async handleMessage(sessionId: string, requestId: string, body: HandleMessageBody): Promise<{ payload: ChatReply, headers?: Record<string, string> }> {
        const { message, patch, language, page, limit } = body;

        /// Guard prefilter: enforce policy early.
        /// Increments guard counters; may soft/firm refuse.
        /// Returns immediately with x-guard when blocked.
        const pre = promptGuardPreFilter(message || '', language || 'mirror');
        if (!pre.allow) {
            const stored = await this.sessionAgent.get(sessionId);
            const now = Date.now();
            const within5 = stored?.guard?.lastOffDomainAt && (now - stored.guard.lastOffDomainAt < 5 * 60_000);
            const count = within5 ? (stored?.guard?.offDomainCount || 0) + 1 : 1;
            const hardRefuse = count >= 2;
            const reply = hardRefuse ? MESSAGES.refuse : pre.reply;
            await this.sessionAgent.set(sessionId, { dto: (stored?.dto || { raw: message || '' }) as any, guard: { lastOffDomainAt: now, offDomainCount: count } });
            const payload: ChatReply = { reply, uiHints: hardRefuse ? undefined : ([{ label: 'Pizza', patch: { type: 'pizza' } }, { label: '≤ ₪60', patch: { maxPrice: 60 } }] as any), state: AgentState.COLLECTING };
            ResSchema.parse(payload);
            return { payload, headers: { 'x-guard': pre.reason } };
        }

        /// Patch flow: refine existing DTO with partial updates.
        /// Fetch restaurants with merged args; validate and adapt.
        /// Persist merged DTO; return results with x-session-id.
        if (patch) {
            let node = createInitialNode(message || '');
            node = reduce(node, { type: 'USER_MESSAGE', text: message || '' });
            node = reduce(node, { type: 'INTENT_OK' });
            node = reduce(node, { type: 'CLARIFIED', patch: patch as any });

            const stored = await this.sessionAgent.get(sessionId);
            const baseDto = (stored?.dto || { raw: message || '' }) as any;
            const mergedDto = { ...baseDto, ...patch } as any;
            const t0 = Date.now();
            const args1 = {
                type: mergedDto.type,
                city: mergedDto.city,
                maxPrice: mergedDto.maxPrice,
                language: language || mergedDto.language || 'mirror',
                userText: message || mergedDto.raw,
                ...(typeof page === 'number' ? { page } : {}),
                ...(typeof limit === 'number' ? { limit } : {})
            } as const;
            const { restaurants, raw } = await this.restaurantService(args1 as any);
            if (!isValidRestaurantsOutput(raw, args1 as any, restaurants)) {
                const reply = MESSAGES.clarify;
                const payload: ChatReply = { reply, uiHints: node.uiHints, state: node.state };
                ResSchema.parse(payload);
                return { payload };
            }
            const vendors = mapRestaurantsToVendors(restaurants);
            const action: ChatAction = { action: 'results', data: { vendors, items: [], query: mergedDto, rawLlm: raw } } as any;
            if (mergedDto.city?.trim()) {
                node = reduce(node, { type: 'SEARCH_START' });
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors, items: [], query: mergedDto } as any });
            }
            const reply = node.reply || `Found ${vendors.length} options.`;
            const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            await this.sessionAgent.set(sessionId, { dto: mergedDto });
            console.log(`[reqId=${requestId}] LLM refine done in ${Date.now() - t0}ms, vendors=${vendors.length}`);
            return { payload, headers: { 'x-session-id': sessionId } };
        }

        /// Intent pipeline: derive intent + structured DTO.
        /// Drives state machine transitions and next actions.
        const result = await runChatPipeline(message || '');

        let node = createInitialNode(message || '');
        node = reduce(node, { type: 'USER_MESSAGE', text: message || '' });

        if (result.kind === 'refuse') {
            node = reduce(node, { type: 'INTENT_OTHER' });
            const reply = node.reply || MESSAGES.refuse;
            const payload: ChatReply = { reply, uiHints: node.uiHints, state: AgentState.REFUSAL };
            ResSchema.parse(payload);
            return { payload };
        }
        if (result.kind === 'greeting') {
            const payload: ChatReply = { reply: MESSAGES.greeting, state: AgentState.COLLECTING };
            ResSchema.parse(payload);
            return { payload };
        }
        if (result.kind === 'clarify') {
            const reply = node.reply || MESSAGES.clarify;
            const payload: ChatReply = { reply, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            return { payload };
        }

        node = reduce(node, { type: 'INTENT_OK' });
        node = reduce(node, { type: 'CLARIFIED', patch: result.dto });

        const hasCity = !!result.dto.city?.trim();
        if (hasCity) {
            node = reduce(node, { type: 'SEARCH_START' });
        }

        /// Find-food intent: call LLM-backed search.
        /// Validate output, map to vendors, persist DTO.
        /// Return results and set x-session-id.
        if (result.intent === 'find_food') {
            const t0 = Date.now();
            const args2 = {
                type: (result.dto as any).type,
                city: (result.dto as any).city,
                maxPrice: (result.dto as any).maxPrice,
                language: language || (result.dto as any).language || 'mirror',
                userText: message || (result.dto as any).raw,
                ...(typeof page === 'number' ? { page } : {}),
                ...(typeof limit === 'number' ? { limit } : {})
            } as const;
            const { restaurants, raw } = await this.restaurantService(args2 as any);
            if (!isValidRestaurantsOutput(raw, args2 as any, restaurants)) {
                const reply = MESSAGES.clarify;
                const payload: ChatReply = { reply, uiHints: node.uiHints, state: node.state };
                ResSchema.parse(payload);
                return { payload };
            }
            const vendors = mapRestaurantsToVendors(restaurants);
            const action: ChatAction = { action: 'results', data: { vendors, items: [], query: result.dto, rawLlm: raw } } as any;
            if (hasCity) {
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors, items: [], query: result.dto } as any });
            }
            const reply = node.reply || `Found ${vendors.length} options.`;
            const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            await this.sessionAgent.set(sessionId, { dto: result.dto });
            console.log(`[reqId=${requestId}] LLM initial done in ${Date.now() - t0}ms, vendors=${vendors.length}`);
            return { payload, headers: { 'x-session-id': sessionId } };
        }

        /// Order flow: delegate to intent handler.
        /// Handler formats reply/action; persist DTO.
        /// Supports results/clarify/refuse/confirm.
        const handler = pickHandler(
            result.intent,
            [new OrderFoodHandler(new InMemoryQuoteService())]
        );
        if (!handler) {
            return { payload: { reply: MESSAGES.clarify } };
        }

        const action: ChatAction = await handler.handle(result.dto);
        if (action.action === 'results') {
            if (hasCity) {
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors: action.data.vendors, items: action.data.items, query: action.data.query } as any });
            }
            const reply = node.reply || `Found ${action.data.vendors.length} vendors and ${action.data.items.length} items.`;
            const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            await this.sessionAgent.set(sessionId, { dto: result.dto });
            return { payload, headers: { 'x-session-id': sessionId } };
        }
        if (action.action === 'refuse') {
            node = reduce(node, { type: 'INTENT_OTHER' });
            const reply = node.reply || action.data.message;
            const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            await this.sessionAgent.set(sessionId, { dto: result.dto });
            return { payload, headers: { 'x-session-id': sessionId } };
        }
        if (action.action === 'clarify') {
            const reply = node.reply || action.data.question;
            const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            await this.sessionAgent.set(sessionId, { dto: result.dto });
            return { payload, headers: { 'x-session-id': sessionId } };
        }
        if (action.action === 'confirm') {
            const reply = `Order total ₪${action.data.total}, ETA ${action.data.etaMinutes}m. Confirm?`;
            const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            await this.sessionAgent.set(sessionId, { dto: result.dto });
            return { payload, headers: { 'x-session-id': sessionId } };
        }
        /// Fallback: generic clarify when no branch matched.
        const payload: ChatReply = { reply: MESSAGES.clarify, uiHints: node.uiHints, state: node.state };
        ResSchema.parse(payload);
        return { payload };
    }
}



