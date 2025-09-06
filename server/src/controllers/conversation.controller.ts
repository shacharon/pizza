import type { Request, Response } from 'express';
import { z } from 'zod';
import config from '../config/index.js';
import { ConversationOrchestrator } from '../services/conversation/orchestrator.service.js';

const orchestrator = new ConversationOrchestrator();

const BodyZ = z.object({
    sessionId: z.string().min(1),
    text: z.string().min(1),
    language: z.enum(['he', 'en', 'ar']).default('he').optional(),
});

export async function conversationHandler(req: Request, res: Response) {
    try {
        const parsed = BodyZ.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
        }

        const { sessionId, text, language } = parsed.data;
        const reply = await orchestrator.chat(sessionId, text, (language as any) ?? 'he');
        return res.json({ reply });
    } catch (e: any) {
        return res.status(500).json({ error: e?.message || 'Unexpected error' });
    }
}


