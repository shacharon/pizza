import type { Request, Response } from 'express';
import { z } from 'zod';
import type { UiHint } from '../agent/reducer.js';
import { randomUUID } from 'node:crypto';
import { getSession, setSession } from '../agent/session.js';
import { openai } from '../services/openai.client.js';
import { runChatPipeline } from '../services/pipeline/chatPipeline.js';
import { FindFoodHandler, OrderFoodHandler, pickHandler } from '../services/handlers/intentHandlers.js';
import type { ChatAction } from '@api';
import { AgentState } from '../agent/states.js';
import { InMemoryVendorSearch } from '../services/adapters/vendorSearch.inmemory.js';
import { InMemoryQuoteService } from '../services/adapters/quoteService.inmemory.js';
import { createInitialNode, reduce } from '../agent/reducer.js';
import { enrichCards } from '../services/og.js';

// Constants and helpers (no magic numbers/strings)
type ChatReply = { reply: string; action?: ChatAction | undefined; uiHints?: UiHint[] | undefined; state?: AgentState };
const ReqSchema = z.object({ message: z.string().min(1).optional(), patch: z.record(z.string(), z.any()).optional() })
    .refine(v => !!(v.message || v.patch), { message: 'message or patch required' });
const ResSchema = z.object({
    reply: z.string(),
    state: z.any().optional(),
    uiHints: z.array(z.object({ label: z.string(), patch: z.record(z.string(), z.any()) })).optional(),
    action: z.union([
        z.object({ action: z.literal('clarify'), data: z.object({ question: z.string(), missing: z.array(z.string()).optional() }) }),
        z.object({ action: z.literal('results'), data: z.object({ vendors: z.array(z.any()), items: z.array(z.any()), query: z.any() }) }),
        z.object({ action: z.literal('confirm'), data: z.object({ quoteId: z.string(), total: z.number(), etaMinutes: z.number() }) }),
        z.object({ action: z.literal('refuse'), data: z.object({ message: z.string() }) }),
        z.object({
            action: z.literal('card'), data: z.object({
                cards: z.array(z.object({
                    title: z.string(), subtitle: z.string().optional(), url: z.string().url(), source: z.string().optional(), imageUrl: z.string().url().optional()
                }))
            })
        })
    ]).optional()
});
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

async function llmRestaurants(dto: any): Promise<{ name: string; price: number }[]> {
    const sys = `You return ONLY JSON. Shape: {"restaurants":[{"name":string,"price":number}]}. \n- price is a number in ILS, no currency sign. \n- Max 7 items. \n- Use city and cuisine/type if provided.`;
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
    return list
        .filter(r => r && typeof r.name === 'string' && typeof r.price === 'number')
        .slice(0, 7)
        .map(r => ({ name: r.name, price: r.price }));
}


const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const INTENT_CONFIDENCE_MIN = 0.6; // minimum confidence to proceed to LLM

export const MESSAGES = {
    missingMessage: 'message is required',
    refuse: 'I can only help with ordering food. Want me to find pizza, sushi, or burgers near you?',
    greeting: 'Hi! I can help order food. Which city and cuisine are you interested in?',
    clarify: 'Just to confirm—are you looking to order food? What city and budget should I use?',
    serverErrorFallback: 'Server error'
} as const;

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
            const vendors = restaurants.map((r, idx) => ({ id: `v_${slugify(r.name)}_${idx}`, name: r.name, distanceMinutes: 0, rating: undefined }));
            const items = restaurants.map((r, idx) => ({ itemId: `i_${slugify(r.name)}_${idx}`, vendorId: vendors[idx].id, name: r.name, price: r.price, tags: [] }));
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


