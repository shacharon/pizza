import type { Request, Response } from 'express';
import { openai } from '../services/openai.client.js';

export async function postChat(req: Request, res: Response) {
    const { message } = req.body as { message?: string };
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }

    try {
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


