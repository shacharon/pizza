/**
 * Assistant LLM Service (Thin Orchestrator)
 *
 * Simple LLM-based assistant message generation for UX messages.
 * Orchestrates: prompt building → LLM call → validation → fallback
 */

import { createHash } from 'node:crypto';
import type { LLMProvider } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildLLMOptions } from '../../../../lib/llm/index.js';
import { z } from 'zod';

// Extracted modules
import type { AssistantLanguage } from './language-detector.js';
import { normalizeRequestedLanguage, detectMessageLanguage, getMessagePreview } from './language-detector.js';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_MESSAGE_ONLY, buildUserPromptJson, buildUserPromptMessageOnly } from './prompt-builder.js';
import { enforceInvariants, validateAndEnforceCorrectness } from './validation-rules.js';
import { getDeterministicFallback } from './fallback-messages.js';
import { compareShadowOutputs } from './shadow-compare.js';

const ASSISTANT_LANG_DEBUG = process.env.ASSISTANT_LANG_DEBUG === '1';
const ASSISTANT_SHADOW_MODE = process.env.ASSISTANT_REFACTOR_SHADOW === 'true';

// ============================================================================
// Types
// ============================================================================

export type { AssistantLanguage };

export interface AssistantGateContext {
  type: 'GATE_FAIL';
  reason: 'NO_FOOD' | 'UNCERTAIN_FOOD';
  query: string;
  language: AssistantLanguage;
}

export interface AssistantClarifyContext {
  type: 'CLARIFY';
  reason: 'MISSING_LOCATION' | 'MISSING_FOOD';
  query: string;
  language: AssistantLanguage;
}

export interface AssistantSummaryContext {
  type: 'SUMMARY';
  query: string;
  language: AssistantLanguage;
  resultCount: number;
  top3Names: string[];
  metadata?: {
    openNowCount?: number;
    currentHour?: number;
    radiusKm?: number;
    filtersApplied?: string[];
  };
  dietaryNote?: {
    type: 'gluten-free';
    shouldInclude: boolean;
  };
}

export interface AssistantSearchFailedContext {
  type: 'SEARCH_FAILED';
  reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
  query: string;
  language: AssistantLanguage;
}

export interface AssistantGenericQueryNarrationContext {
  type: 'GENERIC_QUERY_NARRATION';
  query: string;
  language: AssistantLanguage;
  resultCount: number;
  usedCurrentLocation: boolean;
}

export type AssistantContext =
  | AssistantGateContext
  | AssistantClarifyContext
  | AssistantSummaryContext
  | AssistantSearchFailedContext
  | AssistantGenericQueryNarrationContext;

// Output schema (strict JSON)
export const AssistantOutputSchema = z.object({
  type: z.enum(['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION']),
  message: z.string(),
  question: z.string().nullable(),
  suggestedAction: z.enum(['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS', 'REFINE']),
  blocksSearch: z.boolean()
}).strict();

export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;

// JSON Schema for OpenAI
const ASSISTANT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION'] },
    message: { type: 'string' },
    question: { type: ['string', 'null'] },
    suggestedAction: { type: 'string', enum: ['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS', 'REFINE'] },
    blocksSearch: { type: 'boolean' }
  },
  required: ['type', 'message', 'question', 'suggestedAction', 'blocksSearch'],
  additionalProperties: false
} as const;

// ============================================================================
// Schema Version (for cache keys if needed)
// ============================================================================

export const ASSISTANT_SCHEMA_VERSION = 'v3_strict_validation';
export const ASSISTANT_PROMPT_VERSION = 'v2_language_enforcement';

export const ASSISTANT_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(ASSISTANT_JSON_SCHEMA), 'utf8')
  .digest('hex')
  .substring(0, 12);

// ============================================================================
// Main Function (Thin Orchestrator)
// ============================================================================

export async function generateAssistantMessage(
  context: AssistantContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts?: { timeout?: number; model?: string; traceId?: string; sessionId?: string }
): Promise<AssistantOutput> {
  const startTime = Date.now();
  const requestedLanguage = normalizeRequestedLanguage(context.language);

  // Shadow mode logging
  if (ASSISTANT_SHADOW_MODE) {
    logger.info({
      requestId,
      event: 'assistant_shadow_mode_active',
      type: context.type
    }, '[ASSISTANT_SHADOW] Shadow mode active - infrastructure ready for A/B testing');
  }

  try {
    // Use JSON prompt builder for WebSocket flow
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: buildUserPromptJson(context) }
    ];

    logger.info({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_start',
      type: context.type,
      reason: (context as any).reason,
      questionLanguage: requestedLanguage,
      queryLen: context.query.length,
      schemaVersion: ASSISTANT_SCHEMA_VERSION,
      promptVersion: ASSISTANT_PROMPT_VERSION,
      shadowMode: ASSISTANT_SHADOW_MODE
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

    (llmOpts as any).promptVersion = ASSISTANT_PROMPT_VERSION;
    (llmOpts as any).schemaHash = ASSISTANT_SCHEMA_HASH;

    const result = await llmProvider.completeJSON(
      messages,
      AssistantOutputSchema,
      llmOpts,
      ASSISTANT_JSON_SCHEMA
    );

    const durationMs = Date.now() - startTime;

    const withInvariants = enforceInvariants(result.data, context, requestId);

    // Track whether fallback was used during validation
    let usedFallback = false;
    const beforeValidation = JSON.stringify(withInvariants);
    
    const validated = validateAndEnforceCorrectness(
      withInvariants,
      requestedLanguage,
      context,
      requestId
    );
    
    // Check if validation replaced content with fallback
    const afterValidation = JSON.stringify(validated);
    usedFallback = beforeValidation !== afterValidation;

    logger.info({
      requestId,
      stage: 'assistant_llm',
      event: usedFallback ? 'assistant_llm_parsed_json' : 'assistant_llm_success',
      type: validated.type,
      questionLanguage: requestedLanguage,
      suggestedAction: validated.suggestedAction,
      blocksSearch: validated.blocksSearch,
      validated: !usedFallback,
      usedFallback,
      durationMs,
      usage: result.usage,
      model: result.model
    }, usedFallback 
      ? '[ASSISTANT] LLM parsed JSON successfully (validation failed, used fallback)' 
      : '[ASSISTANT] LLM generated and validated message');

    return validated;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('abort');

    logger.error({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_failed',
      type: context.type,
      questionLanguage: requestedLanguage,
      error: errorMsg,
      isTimeout,
      durationMs
    }, '[ASSISTANT] LLM call failed - using deterministic fallback');

    const fallback = getDeterministicFallback(context, requestedLanguage);

    if (ASSISTANT_LANG_DEBUG) {
      logger.info({
        requestId,
        event: 'assistant_fallback_used_debug',
        messagePreview: getMessagePreview(fallback.message),
        messageDetectedLang: detectMessageLanguage(fallback.message),
        requestedLang: requestedLanguage,
        reason: 'llm_error',
        error: errorMsg,
        isTimeout
      }, '[ASSISTANT_DEBUG] Using fallback due to LLM error');
    }

    return {
      type: context.type,
      message: fallback.message,
      question: fallback.question,
      suggestedAction: fallback.suggestedAction,
      blocksSearch: fallback.blocksSearch
    };
  }
}

/**
 * Stream assistant message as plain text (for SSE delta events).
 * Uses OpenAI streaming (stream: true); does NOT await full completion.
 * Yields partial chunks via onChunk callback.
 */
export async function streamAssistantMessage(
  context: AssistantContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts: {
    onChunk: (text: string) => void;
    traceId?: string;
    sessionId?: string;
    timeout?: number;
    model?: string;
  }
): Promise<void> {
  const requestedLanguage = normalizeRequestedLanguage(context.language);
  
  // Use message-only prompt builder for streaming (no JSON)
  const userPrompt = buildUserPromptMessageOnly(context);
  
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT_MESSAGE_ONLY },
    { role: 'user' as const, content: userPrompt }
  ];

  logger.info(
    { requestId, stage: 'assistant_llm', event: 'assistant_llm_stream_start', type: context.type, questionLanguage: requestedLanguage },
    '[ASSISTANT] Starting stream'
  );

  const llmOpts = buildLLMOptions('assistant', {
    temperature: 0.7,
    requestId,
    stage: 'assistant_llm',
    promptLength: messages.reduce((sum, m) => sum + m.content.length, 0)
  });
  if (opts.timeout) (llmOpts as any).timeout = opts.timeout;
  if (opts.model) llmOpts.model = opts.model;
  if (opts.traceId) (llmOpts as any).traceId = opts.traceId;
  if (opts.sessionId) (llmOpts as any).sessionId = opts.sessionId;

  // ============================================================================
  // DEBUG LOGS: Verify prompt and context before LLM call
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    console.log('[ASSIST_DEBUG] sysPromptHead=', SYSTEM_PROMPT_MESSAGE_ONLY.slice(0, 120));
    console.log('[ASSIST_DEBUG] userPromptHead=', userPrompt.slice(0, 220));
    console.log('[ASSIST_DEBUG] userPromptHas_1_2=', userPrompt.includes('1-2') || userPrompt.includes('1–2'));
    console.log('[ASSIST_DEBUG] ctxStats=', {
      language: context.language,
      resultCount: (context as any).resultCount,
      openNowCount: (context as any).metadata?.openNowCount,
      radiusKm: (context as any).metadata?.radiusKm,
      top3Names: (context as any).top3Names,
    });
  }
  // ============================================================================

  // Capture full streamed text for debugging
  let fullStreamedText = '';
  let chunkCount = 0;

  await llmProvider.completeStream(messages, (chunk: string) => {
    fullStreamedText += chunk;
    chunkCount++;
    opts.onChunk(chunk);
  }, llmOpts);

  // ============================================================================
  // DEBUG LOGS: Verify full message was streamed (no truncation)
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const lineCount = fullStreamedText.split('\n').length;
    console.log('[ASSIST_DEBUG] streamComplete=', {
      totalChunks: chunkCount,
      totalChars: fullStreamedText.length,
      lineCount,
      firstLine: fullStreamedText.split('\n')[0],
      lastLine: fullStreamedText.split('\n')[lineCount - 1],
      hasMultipleLines: lineCount > 1,
    });
    console.log('[ASSIST_DEBUG] fullText=', fullStreamedText);
  }
  // ============================================================================

  logger.info(
    { requestId, stage: 'assistant_llm', event: 'assistant_llm_stream_done', type: context.type },
    '[ASSISTANT] Stream done'
  );
}
