/**
 * INTENT Stage Types
 * Router-only stage - no extraction
 * 
 * NEW: Includes hybrid ordering intent flags
 * These flags are language-agnostic and drive deterministic weight adjustments
 */

import { z } from 'zod';

export const IntentLLMSchema = z.object({
  route: z.enum(['TEXTSEARCH', 'NEARBY', 'LANDMARK', 'CLARIFY']),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  languageConfidence: z.number().min(0).max(1),
  regionCandidate: z.string().regex(/^[A-Z]{2}$/), // ISO-3166-1 alpha-2 CANDIDATE (will be validated by filters_resolved)
  regionConfidence: z.number().min(0).max(1),
  regionReason: z.string().min(1),
  cityText: z.string().min(1).nullable().optional(), // City name for location bias (e.g., "גדרה", "אשקלון") - can be null or undefined

  // ===== NEW: Hybrid Ordering Intent Flags (Language-Agnostic) =====
  // These flags drive deterministic weight adjustments in hybrid ordering

  /** Distance/proximity intent detected (e.g., "near me", "close", "nearby") */
  distanceIntent: z.boolean(),

  /** Explicit "open now" filter requested */
  openNowRequested: z.boolean(),

  /** Price preference intent */
  priceIntent: z.enum(['cheap', 'any']),

  /** Quality/special occasion intent (e.g., "best", "recommended", "romantic") */
  qualityIntent: z.boolean(),

  /** Specific occasion type (if detected) */
  occasion: z.enum(['romantic']).nullable(),

  /** Cuisine key (canonical identifier, e.g., "italian", "japanese") */
  cuisineKey: z.string().nullable(),
}).strict();

export type IntentLLM = z.infer<typeof IntentLLMSchema>;
