import type { Request, Response } from 'express';
import { z } from 'zod';
import type { UiHint } from '../agent/reducer.js';
import { randomUUID } from 'node:crypto';
import { getSession, setSession } from '../agent/session.js';
import { runChatPipeline } from '../services/pipeline/chatPipeline.js';
import { FindFoodHandler, OrderFoodHandler, pickHandler } from '../services/handlers/intentHandlers.js';
import type { ChatAction } from '@api';
import { AgentState } from '../agent/states.js';
import { InMemoryVendorSearch } from '../services/adapters/vendorSearch.inmemory.js';
import { InMemoryQuoteService } from '../services/adapters/quoteService.inmemory.js';
import { createInitialNode, reduce } from '../agent/reducer.js';

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

const ALLOWED_HOSTS = [
    'google.com', 'www.google.com',
    'wolt.com', 'www.wolt.com'
];
function isAllowedUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
    } catch {
        return false;
    }
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
        // If patch is provided, merge into session DTO and bypass LLM to refine results
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
        // ok → before search, propose external cards and gate results until user approves
        const handler = pickHandler(
            result.intent,
            [
                new FindFoodHandler(new InMemoryVendorSearch()),
                new OrderFoodHandler(new InMemoryQuoteService())
            ]
        );
        if (!handler) {
            return json(res, { reply: MESSAGES.clarify });
        }
        // Feed INTENT_OK and known fields into reducer
        node = reduce(node, { type: 'INTENT_OK' });
        node = reduce(node, { type: 'CLARIFIED', patch: result.dto });

        const hasCity = !!result.dto.city?.trim();
        if (hasCity) {
            node = reduce(node, { type: 'SEARCH_START' });
        }

        // Build suggestion cards and "Show results" chip; do not fetch vendors yet
        const city = result.dto.city || '';
        const type = (result.dto as any).type || 'pizza';
        const q = encodeURIComponent(`${type} ${city}`.trim());
        const candidateCards = [
            { title: `Open ${type} on Google Maps${city ? ` — ${city}` : ''}`, url: `https://www.google.com/maps/search/${q}`, source: 'Google Maps' },
            { title: `Browse ${type} on Wolt${city ? ` — ${city}` : ''}`, url: `https://wolt.com/en/search?q=${q}`, source: 'Wolt' }
        ];
        const cards = candidateCards.filter(c => isAllowedUrl(c.url));
        const uiHints = [
            ...(node.uiHints || []),
            { label: 'Show results', patch: { showResults: true } as any }
        ];
        const payloadCard: ChatReply = { reply: node.reply || 'Here are some helpful links.', action: { action: 'card', data: { cards } }, uiHints, state: node.state } as any;
        ResSchema.parse(payloadCard);
        res.setHeader('x-session-id', sessionId);
        return json(res, payloadCard);

        /* If we wanted to fetch immediately (disabled by gating):
        const action: ChatAction = await handler.handle(result.dto);
        if (action.action === 'results') {
            // If city is known, advance reducer with results; otherwise keep the polite city question
            if (hasCity) {
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors: action.data.vendors, items: action.data.items, query: action.data.query } as any });
            }
            const reply = node.reply || `Found ${action.data.vendors.length} vendors and ${action.data.items.length} items.`;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }

        if (false && action.action === 'refuse') {
            // Map to refusal
            node = reduce(node, { type: 'INTENT_OTHER' });
            const reply = node.reply || action.data.message;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        if (false && action.action === 'clarify') {
            // Use model's question, but keep any partial-results state
            const reply = node.reply || action.data.question;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        if (false && action.action === 'confirm') {
            const reply = `Order total ₪${action.data.total}, ETA ${action.data.etaMinutes}m. Confirm?`;
            { const payload: ChatReply = { reply, action, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); setSession(sessionId, { dto: result.dto }); res.setHeader('x-session-id', sessionId); return json(res, payload); }
        }
        */

        // Unreachable; card already returned
        { const payload: ChatReply = { reply: MESSAGES.clarify, uiHints: node.uiHints, state: node.state }; ResSchema.parse(payload); return json(res, payload); }
    } catch (e: any) {
        // Avoid leaking sensitive info
        const msg: string = e?.message || MESSAGES.serverErrorFallback;
        return res.status(500).json({ error: msg });
    }
}


