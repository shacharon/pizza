import type { Request, Response } from 'express';
import { z } from 'zod';
import type { UiHint } from '../agent/reducer.js';
import { randomUUID } from 'node:crypto';
import { getSession, setSession } from '../agent/session.js';
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

// Schemas and reply type
import { ChatReply, ReqSchema, ResSchema } from './schemas.js';


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

type LlmRestaurant = { name: string; price: number } | { name: string; items: { name: string; price: number }[] };
async function llmRestaurants(dto: any): Promise<LlmRestaurant[]> {
    const sys = `You return ONLY JSON. Shape: {"restaurants":[{"name":string,"price"?:number,"items"?:[{"name":string,"price":number}]}]}. \n- price numbers are in ILS, no currency sign. \n- Up to 10 restaurants. If multiple menu items are relevant, include them in items[].`;
    const parts: string[] = [];
    if (dto?.type) parts.push(`type: ${dto.type}`);
    if (dto?.city) parts.push(`city: ${dto.city}`);
    if (dto?.maxPrice) parts.push(`maxPrice: ${dto.maxPrice}`);
    const user = `Find restaurants ${parts.join(', ')}.`;
    const resp = await openai.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: [{ role: 'system', content: sys }, { role: 'user', content: user }]
    });
    const parsed = extractJsonLoose(resp.output_text || '') || {};
    const list: any[] = Array.isArray(parsed?.restaurants) ? parsed.restaurants : [];
    return list.slice(0, 10).filter(r => r && typeof r.name === 'string');
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
    const { message, patch } = parsedBody.data as { message?: string; patch?: Record<string, unknown> };
    const sessionId = (req.headers['x-session-id'] as string) || randomUUID();

    try {
        // If patch is provided, merge into session DTO and run stubbed vendor search (in-memory)
        if (patch) {
            let node = createInitialNode(message || '');
            node = reduce(node, { type: 'USER_MESSAGE', text: message || '' });
            node = reduce(node, { type: 'INTENT_OK' });
            node = reduce(node, { type: 'CLARIFIED', patch: patch as any });

            const stored = getSession(sessionId);
            const baseDto = (stored?.dto || { raw: message || '' }) as any;
            const mergedDto = { ...baseDto, ...patch } as any;

            const handler = pickHandler('find_food', [new FindFoodHandler(new InMemoryVendorSearch())]);
            if (!handler) {
                const payload: ChatReply = { reply: MESSAGES.clarify, state: node.state, uiHints: node.uiHints };
                ResSchema.parse(payload);
                res.setHeader('x-session-id', sessionId);
                return json(res, payload);
            }
            const action: ChatAction = await handler.handle(mergedDto);
            if (action.action === 'results') {
                if (mergedDto.city?.trim()) {
                    node = reduce(node, { type: 'SEARCH_START' });
                    node = reduce(node, { type: 'SEARCH_OK', results: { vendors: action.data.vendors, items: action.data.items, query: action.data.query } as any });
                }
                const reply = node.reply || `Found ${action.data.vendors.length} vendors and ${action.data.items.length} items.`;
                const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
                ResSchema.parse(payload);
                setSession(sessionId, { dto: mergedDto });
                res.setHeader('x-session-id', sessionId);
                return json(res, payload);
            }
            const reply = node.reply || MESSAGES.clarify;
            const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state };
            ResSchema.parse(payload);
            res.setHeader('x-session-id', sessionId);
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
        // For find flow → call LLM to get restaurants list (name + price), then adapt to stubbed shape
        if (result.intent === 'find_food') {
            const restaurants = await llmRestaurants(result.dto);
            // Adapt to stub SearchResultDTO shape
            const vendors = restaurants.map((r: any, idx: number) => ({ id: `v_${slugify(r.name)}_${idx}`, name: r.name, distanceMinutes: 0, rating: undefined }));
            // Build items: for restaurants with items[], map each; else use single item with price if present.
            const items: any[] = [];
            restaurants.forEach((r: any, idx: number) => {
                const vendorId = vendors[idx]?.id ?? `v_${slugify(r.name)}_${idx}`;
                if (Array.isArray(r.items) && r.items.length) {
                    r.items.forEach((it: any, j: number) => {
                        if (typeof it?.name === 'string' && typeof it?.price === 'number') {
                            items.push({ itemId: `i_${slugify(r.name)}_${j}`, vendorId, name: it.name, price: it.price, tags: [] });
                        }
                    });
                } else if (typeof r.price === 'number') {
                    items.push({ itemId: `i_${slugify(r.name)}_0`, vendorId, name: r.name, price: r.price, tags: [] });
                }
            });
            const action: ChatAction = { action: 'results', data: { vendors, items, query: result.dto } } as any;
            if (hasCity) {
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors, items, query: result.dto } as any });
            }
            const reply = node.reply || `Found ${vendors.length} options.`;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
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
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        if (action.action === 'refuse') {
            node = reduce(node, { type: 'INTENT_OTHER' });
            const reply = node.reply || action.data.message;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        if (action.action === 'clarify') {
            const reply = node.reply || action.data.question;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        if (action.action === 'confirm') {
            const reply = `Order total ₪${action.data.total}, ETA ${action.data.etaMinutes}m. Confirm?`;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        { const payload: ChatReply = { reply: MESSAGES.clarify, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); return json(res, payload); }
    } catch (e: any) {
        // Avoid leaking sensitive info
        const msg: string = e?.message || MESSAGES.serverErrorFallback;
        return res.status(500).json({ error: msg });
    }
}


