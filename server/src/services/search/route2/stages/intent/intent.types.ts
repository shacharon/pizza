/**
 * INTENT Stage Types
 * Router-only stage - no extraction
 */

import { z } from 'zod';

export const IntentLLMSchema = z.object({
  route: z.enum(['TEXTSEARCH', 'NEARBY', 'LANDMARK']),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

export type IntentLLM = z.infer<typeof IntentLLMSchema>;
