import type { Request, Response } from 'express';
import { runChatPipeline } from '../services/pipeline/chatPipeline.js';
import { FindFoodHandler, OrderFoodHandler, pickHandler } from '../services/handlers/intentHandlers.js';
import type { ChatAction } from '@api';
import { InMemoryVendorSearch } from '../services/adapters/vendorSearch.inmemory.js';
import { InMemoryQuoteService } from '../services/adapters/quoteService.inmemory.js';
import { createInitialNode, reduce } from '../agent/reducer.js';

// Constants and helpers (no magic numbers/strings)
type ChatReply = { reply: string; action?: ChatAction | undefined; uiHints?: string[] | undefined };

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
    const { message } = req.body as { message?: string };
    if (!message || !message.trim()) {
        return res.status(400).json({ error: MESSAGES.missingMessage });
    }

    try {
        const result = await runChatPipeline(message);

        // Initialize agent node and feed basic intent events
        let node = createInitialNode(message);
        node = reduce(node, { type: 'USER_MESSAGE', text: message });

        if (result.kind === 'refuse') {
            node = reduce(node, { type: 'INTENT_OTHER' });
            const reply = node.reply || MESSAGES.refuse;
            return json(res, { reply, uiHints: node.uiHints });
        }
        if (result.kind === 'greeting') {
            // State machine has no greeting branch; use static greeting
            return json(res, { reply: MESSAGES.greeting });
        }
        if (result.kind === 'clarify') {
            // Low confidence; keep generic clarify
            const reply = node.reply || MESSAGES.clarify;
            return json(res, { reply, uiHints: node.uiHints });
        }
        // ok → dispatch to strategy handler (find/order)
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

        const action: ChatAction = await handler.handle(result.dto);

        if (action.action === 'results') {
            // If city is known, advance reducer with results; otherwise keep the polite city question
            if (hasCity) {
                node = reduce(node, { type: 'SEARCH_OK', results: { vendors: action.data.vendors, items: action.data.items, query: action.data.query } as any });
            }
            const reply = node.reply || `Found ${action.data.vendors.length} vendors and ${action.data.items.length} items.`;
            return json(res, { reply, action, uiHints: node.uiHints });
        }

        if (action.action === 'refuse') {
            // Map to refusal
            node = reduce(node, { type: 'INTENT_OTHER' });
            const reply = node.reply || action.data.message;
            return json(res, { reply, action, uiHints: node.uiHints });
        }
        if (action.action === 'clarify') {
            // Use model's question, but keep any partial-results state
            const reply = node.reply || action.data.question;
            return json(res, { reply, action, uiHints: node.uiHints });
        }
        if (action.action === 'confirm') {
            const reply = `Order total ₪${action.data.total}, ETA ${action.data.etaMinutes}m. Confirm?`;
            return json(res, { reply, action, uiHints: node.uiHints });
        }
        // Fallback
        return json(res, { reply: MESSAGES.clarify, uiHints: node.uiHints });
    } catch (e: any) {
        // Avoid leaking sensitive info
        const msg: string = e?.message || MESSAGES.serverErrorFallback;
        return res.status(500).json({ error: msg });
    }
}


