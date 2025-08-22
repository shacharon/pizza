import type { Request, Response } from 'express';
import { openai } from '../services/openai.client.js';
import { detectIntent } from '../services/intent.js';

export async function postChat(req: Request, res: Response) {
    const { message } = req.body as { message?: string };
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }

    try {
        // 0) Intent gate – refuse or clarify before any LLM generation
        const { intent, confidence } = await detectIntent(message);
        if (intent === 'not_food') {
            return res.json({ reply: 'I can only help with ordering food. Want me to find pizza, sushi, or burgers near you?' });
        }
        if (intent === 'greeting') {
            return res.json({ reply: 'Hi! I can help order food. Which city and cuisine are you interested in?' });
        }
        if (confidence < 0.6) {
            return res.json({ reply: 'Just to confirm—are you looking to order food? What city and budget should I use?' });
        }

        const resp = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            input: [{ role: 'user', content: message }]
        });
        const text = resp.output_text ?? '';
        return res.json({ reply: text });
    } catch (e: any) {
        // avoid leaking sensitive info
        const msg = e?.message || 'Server error';
        return res.status(500).json({ error: msg });
    }
}


