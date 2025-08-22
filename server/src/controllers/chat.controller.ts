import type { Request, Response } from 'express';
import { runChatPipeline } from '../services/pipeline/chatPipeline.js';
import { FindFoodHandler, OrderFoodHandler, pickHandler } from '../services/handlers/intentHandlers.js';
import type { ChatAction } from '@api';
import { InMemoryVendorSearch } from '../services/adapters/vendorSearch.inmemory.js';
import { InMemoryQuoteService } from '../services/adapters/quoteService.inmemory.js';

// Constants and helpers (no magic numbers/strings)
type ChatReply = { reply: string };

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
        if (result.kind === 'refuse') {
            return json(res, { reply: MESSAGES.refuse });
        }
        if (result.kind === 'greeting') {
            return json(res, { reply: MESSAGES.greeting });
        }
        if (result.kind === 'clarify') {
            return json(res, { reply: MESSAGES.clarify });
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
        const action: ChatAction = await handler.handle(result.dto);
        // Map actions to simple reply for now; UI can consume structured actions later
        if (action.action === 'refuse') return json(res, { reply: action.data.message });
        if (action.action === 'clarify') return json(res, { reply: action.data.question });
        if (action.action === 'confirm') return json(res, { reply: `Order total ₪${action.data.total}, ETA ${action.data.etaMinutes}m. Confirm?` });
        // results
        return json(res, { reply: `Found ${action.data.vendors.length} vendors and ${action.data.items.length} items.` });
    } catch (e: any) {
        // Avoid leaking sensitive info
        const msg: string = e?.message || MESSAGES.serverErrorFallback;
        return res.status(500).json({ error: msg });
    }
}


