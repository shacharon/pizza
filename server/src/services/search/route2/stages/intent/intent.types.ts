/**
 * INTENT Stage Types
 * Router-only stage - no extraction
 */

import { z } from 'zod';

export const IntentLLMSchema = z.object({
  route: z.enum(['TEXTSEARCH', 'NEARBY', 'LANDMARK']),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  region: z.string().regex(/^[A-Z]{2}$/), // ISO-3166-1 alpha-2
  regionConfidence: z.number().min(0).max(1),
  regionReason: z.string().min(1),
  cityText: z.string().min(1).optional(), // City name for location bias (e.g., "גדרה", "אשקלון")
}).strict();

export type IntentLLM = z.infer<typeof IntentLLMSchema>;
