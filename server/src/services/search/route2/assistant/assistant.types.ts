/**
 * Assistant Types and Schemas
 * Shared type definitions for assistant message generation
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

// ============================================================================
// Context Types
// ============================================================================

export interface AssistantGateContext {
  type: 'GATE_FAIL';
  reason: 'NO_FOOD' | 'UNCERTAIN_FOOD';
  query: string;
  language: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other';
}

export interface AssistantClarifyContext {
  type: 'CLARIFY';
  reason: 'MISSING_LOCATION' | 'MISSING_FOOD';
  query: string;
  language: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other';
}

export interface AssistantSummaryContext {
  type: 'SUMMARY';
  query: string;
  language: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other';
  resultCount: number;
  top3Names: string[];
  // INSIGHT METADATA: Data for intelligent narration
  // NOTE: openNowCount and currentHour are ONLY included if ALL results have known status
  // If any result has unknown status, these fields are omitted entirely
  metadata?: {
    openNowCount?: number; // How many results are currently open (only if no unknowns)
    currentHour?: number; // Current hour (0-23) for time-based insights (only if no unknowns)
    radiusKm?: number; // Search radius in kilometers
    filtersApplied?: string[]; // Active filters (e.g., ['OPEN_NOW', 'kosher', 'price:2'])
  };
  // DIETARY NOTE: Optional soft dietary hint (merged into summary)
  dietaryNote?: {
    type: 'gluten-free';
    shouldInclude: boolean;
  };
}

export interface AssistantSearchFailedContext {
  type: 'SEARCH_FAILED';
  reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
  query: string;
  language: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other';
}

export interface AssistantGenericQueryNarrationContext {
  type: 'GENERIC_QUERY_NARRATION';
  query: string;
  language: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other';
  resultCount: number;
  usedCurrentLocation: boolean; // True if userLocation was used
}

export type AssistantContext =
  | AssistantGateContext
  | AssistantClarifyContext
  | AssistantSummaryContext
  | AssistantSearchFailedContext
  | AssistantGenericQueryNarrationContext;

// ============================================================================
// Output Schema
// ============================================================================

export const AssistantOutputSchema = z.object({
  type: z.enum(['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION']),
  message: z.string(),
  question: z.string().nullable(),
  suggestedAction: z.enum(['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS', 'REFINE']),
  blocksSearch: z.boolean(),
  language: z.enum(['he', 'en', 'ar', 'ru', 'fr', 'es']).optional() // Language of the generated message (assistantLanguage)
}).strict();

export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;

// JSON Schema for OpenAI
export const ASSISTANT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION'] },
    message: { type: 'string' },
    question: { type: ['string', 'null'] },
    suggestedAction: { type: 'string', enum: ['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS', 'REFINE'] },
    blocksSearch: { type: 'boolean' },
    language: { type: 'string', enum: ['he', 'en', 'ar', 'ru', 'fr', 'es'] }
  },
  required: ['type', 'message', 'question', 'suggestedAction', 'blocksSearch', 'language'],
  additionalProperties: false
} as const;

// ============================================================================
// Schema Versioning
// ============================================================================

export const ASSISTANT_SCHEMA_VERSION = 'v3_strict_validation';
export const ASSISTANT_PROMPT_VERSION = 'v2_language_enforcement';

// Generate schema hash for telemetry (consistent with other mappers)
export const ASSISTANT_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(ASSISTANT_JSON_SCHEMA), 'utf8')
  .digest('hex')
  .substring(0, 12);
