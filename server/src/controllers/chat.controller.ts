import type { Request, Response } from 'express';
import { z } from 'zod';
import type { UiHint } from '../agent/reducer.js';
import { randomUUID } from 'node:crypto';
import { openai } from '../services/openai.client.js';
import { DEFAULT_MODEL, INTENT_CONFIDENCE_MIN, MESSAGES } from './constants.js';
import { runChatPipeline } from '../services/pipeline/chatPipeline.js';
import { FindFoodHandler, OrderFoodHandler, pickHandler } from '../services/handlers/intentHandlers.js';
import type { ChatAction } from '@api';
import { AgentState } from '../agent/states.js';
import { InMemoryVendorSearch } from '../services/adapters/vendorSearch.inmemory.js';
import { InMemoryQuoteService } from '../services/adapters/quoteService.inmemory.js';
import { createInitialNode, reduce } from '../agent/reducer.js';
import { enrichCards } from '../services/og.js';
import { getRestaurants, isValidRestaurantsOutput } from '../services/llm/restaurant.service.js';
import { promptGuardPreFilter } from '../services/pipeline/promptGuard.js';
import { InMemorySessionAgent } from '../store/inMemorySessionAgent.js';

// Schemas and reply type
import { ChatReply, ReqSchema, ResSchema } from './schemas.js';

const sessionAgent = new InMemorySessionAgent();

function slugify(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function extractJsonLoose(text: string): any | null {
    if (!text) return null;
    const raw = text.trim();
    const fence = raw.match(/```(?:json)?\n([\s\S]*?)```/i);
    const candidate = fence?.[1]?.trim() ?? raw;
    try { return JSON.parse(candidate); } catch { }
    // Balanced object scan
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

type LlmRestaurant = { name: string; price?: number; address?: string; description?: string } | { name: string; address?: string; description?: string; items: { name: string; price: number }[] };
async function llmRestaurants(dto: any): Promise<{ restaurants: LlmRestaurant[]; raw: string }> {
    const sys = `You return ONLY JSON. Shape: {"restaurants":[{"name":string,"address"?:string,"price"?:number,"description"?:string,"items"?:[{"name":string,"price":number}]}]}. \n- price numbers are in ILS (number only, no currency sign). \n- Include 1-2 sentence description of the place in the user's language under "description". \n- Up to 20 restaurants. If the restaurant has multiple relevant items/prices, include them under items[]. Always include address when known.`;
    const parts: string[] = [];
    if (dto?.type) parts.push(`type: ${dto.type}`);
    if (dto?.city) parts.push(`city: ${dto.city}`);
    if (dto?.maxPrice) parts.push(`maxPrice: ${dto.maxPrice}`);
    const user = `Find restaurants ${parts.join(', ')}.`;
    const resp = await openai.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: [{ role: 'system', content: sys }, { role: 'user', content: user }]
    });
    const raw = resp.output_text || '';
    const parsed = extractJsonLoose(raw) || {};
    const list: any[] = Array.isArray(parsed?.restaurants) ? parsed.restaurants : [];
    return { restaurants: list.slice(0, 20).filter(r => r && typeof r.name === 'string'), raw };
}


// constants moved to ./constants

function json(res: Response, payload: ChatReply, status: number = 200) {
    return res.status(status).json(payload);
}

export async function postChat(req: Request, res: Response) {
    const parsedBody = ReqSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ error: MESSAGES.missingMessage });
    }
    const { message, patch, language, page, limit } = parsedBody.data as { message?: string; patch?: Record<string, unknown>; language?: 'mirror' | 'he' | 'en'; page?: number; limit?: number };
    const sessionId = (req.headers['x-session-id'] as string) || randomUUID();
    const requestId = randomUUID();

    try {
        // PromptGuard prefilter at controller-level (signals to client via header)
        const pre = promptGuardPreFilter(message || '', language || 'mirror');
        if (!pre.allow) {
            res.setHeader('x-guard', pre.reason);
            const stored = await sessionAgent.get(sessionId);
            const now = Date.now();
            const within5 = stored?.guard?.lastOffDomainAt && (now - stored.guard.lastOffDomainAt < 5 * 60_000);
            const count = within5 ? (stored?.guard?.offDomainCount || 0) + 1 : 1;
            const hardRefuse = count >= 2; // first time soft nudge, then firmer refusal
            const reply = hardRefuse ? MESSAGES.refuse : pre.reply;
            await sessionAgent.set(sessionId, { dto: (stored?.dto || { raw: message || '' }) as any, guard: { lastOffDomainAt: now, offDomainCount: count } });
            const payload: ChatReply = { reply, uiHints: hardRefuse ? undefined : ([{ label: 'Pizza', patch: { type: 'pizza' } }, { label: '≤ ₪60', patch: { maxPrice: 60 } }] as any), state: AgentState.COLLECTING };
            ResSchema.parse(payload);
            return json(res, payload);
        }
        // If patch is provided, merge into session DTO and use LLM service for refined results
        if (patch) {
            let node = createInitialNode(message || '');
            node = reduce(node, { type: 'USER_MESSAGE', text: message || '' });
            node = reduce(node, { type: 'INTENT_OK' });
            node = reduce(node, { type: 'CLARIFIED', patch: patch as any });

            const stored = await sessionAgent.get(sessionId);
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
            const { restaurants, raw } = await getRestaurants(args1 as any);
            if (!isValidRestaurantsOutput(raw, args1 as any, restaurants)) {
                const reply = MESSAGES.clarify;
                const payload: ChatReply = { reply, uiHints: node.uiHints, state: node.state };
                ResSchema.parse(payload);
                return json(res, payload);
            }
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
            const action: ChatAction = { action: 'results', data: { vendors, items: [], query: mergedDto, rawLlm: raw } } as any;
            if (mergedDto.city?.trim()) {
                node = reduce(node, { type: 'SEARCH_START' });
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors, items: [], query: mergedDto } as any });
            }
            const reply = node.reply || `Found ${vendors.length} options.`;
            const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            await sessionAgent.set(sessionId, { dto: mergedDto });
            res.setHeader('x-session-id', sessionId);
            console.log(`[reqId=${requestId}] LLM refine done in ${Date.now() - t0}ms, vendors=${vendors.length}`);
            return json(res, payload);
        }

        const result = await runChatPipeline(message || '');

        // Initialize agent node and feed basic intent events
        let node = createInitialNode(message || '');
        node = reduce(node, { type: 'USER_MESSAGE', text: message || '' });

        if (result.kind === 'refuse') {
            node = reduce(node, { type: 'INTENT_OTHER' });
            const reply = node.reply || MESSAGES.refuse;
            { const payload: ChatReply = { reply, uiHints: node.uiHints, state: AgentState.REFUSAL }; ResSchema.parse(payload); return json(res, payload); }
        }
        if (result.kind === 'greeting') {
            // State machine has no greeting branch; use static greeting
            { const payload: ChatReply = { reply: MESSAGES.greeting, state: AgentState.COLLECTING }; ResSchema.parse(payload); return json(res, payload); }
        }
        if (result.kind === 'clarify') {
            // Low confidence; keep generic clarify
            const reply = node.reply || MESSAGES.clarify;
            { const payload: ChatReply = { reply, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); return json(res, payload); }
        }
        // Feed INTENT_OK and known fields into reducer
        node = reduce(node, { type: 'INTENT_OK' });
        node = reduce(node, { type: 'CLARIFIED', patch: result.dto });

        const hasCity = !!result.dto.city?.trim();
        if (hasCity) {
            node = reduce(node, { type: 'SEARCH_START' });
        }
        // For find flow → call LLM service to get restaurants and adapt to results
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
            const { restaurants, raw } = await getRestaurants(args2 as any);
            if (!isValidRestaurantsOutput(raw, args2 as any, restaurants)) {
                const reply = MESSAGES.clarify;
                const payload: ChatReply = { reply, uiHints: node.uiHints, state: node.state };
                ResSchema.parse(payload);
                return json(res, payload);
            }
            // Adapt to stub SearchResultDTO shape
            // Build vendors as rows; duplicate rows for same restaurant if multiple items (each with its own price)
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
            const action: ChatAction = { action: 'results', data: { vendors, items: [], query: result.dto, rawLlm: raw } } as any;
            if (hasCity) {
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors, items: [], query: result.dto } as any });
            }
            const reply = node.reply || `Found ${vendors.length} options.`;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); await sessionAgent.set(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); console.log(`[reqId=${requestId}] LLM initial done in ${Date.now() - t0}ms, vendors=${vendors.length}`); return json(res, payload); }
        }

        // ok → dispatch to strategy handler (order only)
        const handler = pickHandler(
            result.intent,
            [
                new OrderFoodHandler(new InMemoryQuoteService())
            ]
        );
        if (!handler) {
            return json(res, { reply: MESSAGES.clarify });
        }

        const action: ChatAction = await handler.handle(result.dto);
        if (action.action === 'results') {
            if (hasCity) {
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors: action.data.vendors, items: action.data.items, query: action.data.query } as any });
            }
            const reply = node.reply || `Found ${action.data.vendors.length} vendors and ${action.data.items.length} items.`;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); await sessionAgent.set(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        if (action.action === 'refuse') {
            node = reduce(node, { type: 'INTENT_OTHER' });
            const reply = node.reply || action.data.message;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); await sessionAgent.set(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        if (action.action === 'clarify') {
            const reply = node.reply || action.data.question;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); await sessionAgent.set(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        if (action.action === 'confirm') {
            const reply = `Order total ₪${action.data.total}, ETA ${action.data.etaMinutes}m. Confirm?`;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); await sessionAgent.set(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        { const payload: ChatReply = { reply: MESSAGES.clarify, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); return json(res, payload); }
    } catch (e: any) {
        // Avoid leaking sensitive info
        const msg: string = e?.message || MESSAGES.serverErrorFallback;
        return res.status(500).json({ error: msg });
    }
}


