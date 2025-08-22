import { z } from 'zod';
import type { ChatAction } from '@api';
import type { UiHint } from '../agent/reducer.js';
import type { AgentState } from '../agent/states.js';

export type ChatReply = { reply: string; action?: ChatAction | undefined; uiHints?: UiHint[] | undefined; state?: AgentState };

export const ReqSchema = z.object({ message: z.string().min(1).optional(), patch: z.record(z.string(), z.any()).optional() })
    .refine(v => !!(v.message || v.patch), { message: 'message or patch required' });

export const ResSchema = z.object({
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


