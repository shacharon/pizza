import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { MESSAGES } from './constants.js';
import { getRestaurants } from '../services/llm/restaurant.service.js';
import config from '../config/index.js';
import { ConversationOrchestrator } from '../services/conversation/orchestrator.service.js';
import { createLLMProvider } from '../llm/factory.js';
import { InMemorySessionAgent } from '../store/inMemorySessionAgent.js';
import { ChatService, HandleMessageBody } from '../services/chat/chat.service.js';
import { ChatReply, ReqSchema } from './schemas.js';

const sessionAgent = new InMemorySessionAgent();
const llm = createLLMProvider();
const restaurantsWithLlm = (args: Parameters<typeof getRestaurants>[0]) => getRestaurants(args);
const chatService = new ChatService(sessionAgent, restaurantsWithLlm);

function json(res: Response, payload: ChatReply, status: number = 200) {
    return res.status(status).json(payload);
}

export async function postChat(req: Request, res: Response) {
    const parsedBody = ReqSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return res.status(400).json({ error: MESSAGES.missingMessage });
    }

    const sessionId = (req.headers['x-session-id'] as string) || randomUUID();
    const requestId = randomUUID();

    try {
        // Route through new orchestrator when enabled for consistent UI payload
        if (config.CONVERSATION_ENGINE && config.CONVERSATION_ENGINE !== 'legacy') {
            const orchestrator = new ConversationOrchestrator();
            const lang = (parsedBody.data.language === 'mirror' ? 'he' : (parsedBody.data.language || 'he')) as any;
            const message = (parsedBody.data as any).message || '';
            const reply = await orchestrator.chat(sessionId, message, lang);
            return json(res, { reply });
        }

        const result = await chatService.handleMessage(sessionId, requestId, parsedBody.data as HandleMessageBody);
        if (result.headers) {
            for (const [key, value] of Object.entries(result.headers)) {
                res.setHeader(key, value);
            }
        }
        return json(res, result.payload);
    } catch (e: any) {
        // Avoid leaking sensitive info
        const msg: string = e?.message || MESSAGES.serverErrorFallback;
        console.error(`[reqId=${requestId}] Error: ${msg}`, e);
        return res.status(500).json({ error: msg });
    }
}


