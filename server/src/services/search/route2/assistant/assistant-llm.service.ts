/**
 * Assistant LLM Service
 * 
 * Simple LLM-based assistant message generation for UX messages.
 * NO post-processing, NO policy enforcement, NO deterministic logic.
 * Pure LLM → strict JSON parsing → done.
 */

import type { LLMProvider } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildLLMOptions } from '../../../../lib/llm/index.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface AssistantGateContext {
  type: 'GATE_FAIL';
  reason: 'NO_FOOD' | 'UNCERTAIN_FOOD';
  query: string;
  language: 'he' | 'en' | 'other';
}

export interface AssistantClarifyContext {
  type: 'CLARIFY';
  reason: 'MISSING_LOCATION' | 'MISSING_FOOD';
  query: string;
  language: 'he' | 'en' | 'other';
}

export interface AssistantSummaryContext {
  type: 'SUMMARY';
  query: string;
  language: 'he' | 'en' | 'other';
  resultCount: number;
  top3Names: string[];
}

export interface AssistantSearchFailedContext {
  type: 'SEARCH_FAILED';
  reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
  query: string;
  language: 'he' | 'en' | 'other';
}

export type AssistantContext =
  | AssistantGateContext
  | AssistantClarifyContext
  | AssistantSummaryContext
  | AssistantSearchFailedContext;

// Output schema (strict JSON)
export const AssistantOutputSchema = z.object({
  type: z.enum(['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED']),
  message: z.string(),
  question: z.string().nullable(),
  suggestedAction: z.enum(['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS']),
  blocksSearch: z.boolean()
}).strict();

export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;

// JSON Schema for OpenAI
const ASSISTANT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED'] },
    message: { type: 'string' },
    question: { type: ['string', 'null'] },
    suggestedAction: { type: 'string', enum: ['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS'] },
    blocksSearch: { type: 'boolean' }
  },
  required: ['type', 'message', 'question', 'suggestedAction', 'blocksSearch'],
  additionalProperties: false
} as const;

// ============================================================================
// LLM Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are an assistant for a food search app. Return ONLY JSON.

Rules:
- Be friendly, concise, helpful
- Output English only
- "question" field: use when appropriate (CLARIFY always has question, others optional)
- "blocksSearch": true means stop search, false means continue

Schema: {"type":"GATE_FAIL|CLARIFY|SUMMARY|SEARCH_FAILED","message":"...","question":"..."|null,"suggestedAction":"NONE|ASK_LOCATION|ASK_FOOD|RETRY|EXPAND_RADIUS","blocksSearch":true|false}`;

function buildUserPrompt(context: AssistantContext): string {
  if (context.type === 'GATE_FAIL') {
    const reason = context.reason === 'NO_FOOD' ? 'not food-related' : 'uncertain if food-related';
    return `Query: "${context.query}"
Type: GATE_FAIL
Reason: ${reason}

Generate friendly onboarding message in English. Guide user to proper food search. Set blocksSearch=true.`;
  }

  if (context.type === 'CLARIFY') {
    const missing = context.reason === 'MISSING_LOCATION' ? 'location' : 'food type';
    return `Query: "${context.query}"
Type: CLARIFY
Reason: missing ${missing}

Ask 1 question in English to clarify. Set blocksSearch=true (STOP search).`;
  }

  if (context.type === 'SEARCH_FAILED') {
    const reason = context.reason === 'GOOGLE_TIMEOUT' ? 'Google API timeout' : 'provider error';
    return `Query: "${context.query}"
Type: SEARCH_FAILED
Reason: ${reason}

Tell user search failed due to technical issue. Suggest retry. Set suggestedAction=RETRY, blocksSearch=false.`;
  }

  // SUMMARY
  return `Query: "${context.query}"
Type: SUMMARY
Results: ${context.resultCount}
Top3: ${context.top3Names.slice(0, 3).join(', ')}

Summarize results in English (1-2 sentences). Set blocksSearch=false.`;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate assistant message via LLM
 * NO post-processing - pure LLM output with strict schema validation
 */
export async function generateAssistantMessage(
  context: AssistantContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts?: { timeout?: number; model?: string; traceId?: string; sessionId?: string }
): Promise<AssistantOutput> {
  const startTime = Date.now();

  try {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: buildUserPrompt(context) }
    ];

    logger.info({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_start',
      type: context.type,
      reason: (context as any).reason,
      queryLen: context.query.length
    }, '[ASSISTANT] Calling LLM');

    const llmOpts = buildLLMOptions('assistant', {
      temperature: 0.7,
      requestId,
      stage: 'assistant_llm',
      promptLength: messages.reduce((sum, m) => sum + m.content.length, 0)
    });

    if (opts?.model) llmOpts.model = opts.model;
    if (opts?.timeout) llmOpts.timeout = opts.timeout;
    if (opts?.traceId) (llmOpts as any).traceId = opts.traceId;
    if (opts?.sessionId) (llmOpts as any).sessionId = opts.sessionId;

    const result = await llmProvider.completeJSON(
      messages,
      AssistantOutputSchema,
      llmOpts,
      ASSISTANT_JSON_SCHEMA
    );

    const durationMs = Date.now() - startTime;

    logger.info({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_success',
      type: result.data.type,
      suggestedAction: result.data.suggestedAction,
      blocksSearch: result.data.blocksSearch,
      durationMs,
      usage: result.usage,
      model: result.model
    }, '[ASSISTANT] LLM generated message');

    return result.data;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_failed',
      type: context.type,
      error: errorMsg,
      durationMs
    }, '[ASSISTANT] LLM call failed, using generic fallback');

    // Generic fallback only (no deterministic logic)
    return getGenericFallback(context);
  }
}

/**
 * Minimal generic fallback (last resort only)
 */
function getGenericFallback(context: AssistantContext): AssistantOutput {
  if (context.type === 'SEARCH_FAILED') {
    return {
      type: 'SEARCH_FAILED',
      message: 'Search temporarily unavailable. Please try again.',
      question: null,
      suggestedAction: 'RETRY',
      blocksSearch: false
    };
  }

  if (context.type === 'CLARIFY') {
    return {
      type: 'CLARIFY',
      message: 'Could you provide more details about what you\'re looking for?',
      question: 'What type of food would you like?',
      suggestedAction: 'ASK_FOOD',
      blocksSearch: true
    };
  }

  if (context.type === 'SUMMARY') {
    return {
      type: 'SUMMARY',
      message: `Found ${context.resultCount} results.`,
      question: null,
      suggestedAction: 'NONE',
      blocksSearch: false
    };
  }

  // GATE_FAIL
  return {
    type: 'GATE_FAIL',
    message: 'This doesn\'t look like a food search. Try: "pizza in Tel Aviv".',
    question: null,
    suggestedAction: 'ASK_FOOD',
    blocksSearch: true
  };
}
