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
import type { TopCandidate, SummaryAnalysisMode } from './assistant.types.js';

const ASSISTANT_LANG_DEBUG = process.env.ASSISTANT_LANG_DEBUG === '1';
const ASSISTANT_SHADOW_MODE = process.env.ASSISTANT_REFACTOR_SHADOW === 'true';

/** In-memory guard: prevent duplicate SUMMARY LLM calls per requestId. */
const summaryGenStateByRequestId = new Map<string, 'RUNNING' | 'DONE'>();

function preview(s: string | undefined | null, n = 80): string {
  return (s ?? '').slice(0, n);
}
function keys(o: unknown): string[] {
  return o && typeof o === 'object' ? Object.keys(o).sort() : [];
}

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
  /** Top candidates for narration (max 4). */
  top: TopCandidate[];
  analysisMode: SummaryAnalysisMode;
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
  /** Optional refine hint for SATURATED MESSAGE_ONLY. */
  nextStepHint?: string;
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

  // A) Prevent duplicate SUMMARY LLM calls per requestId
  if (context.type === 'SUMMARY') {
    const state = summaryGenStateByRequestId.get(requestId);
    if (state === 'RUNNING' || state === 'DONE') {
      logger.info({ event: 'summary_skipped_duplicate', requestId, state });
      const fallback = getDeterministicFallback(context, requestedLanguage);
      return {
        type: context.type,
        ...fallback,
        _summaryEmitSource: 'fallback' as const,
        _summaryEmitReason: 'duplicate_request'
      } as AssistantOutput;
    }
    summaryGenStateByRequestId.set(requestId, 'RUNNING');
  }

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
    const userPrompt = buildUserPromptJson(context);
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: userPrompt }
    ];

    if (context.type === 'SUMMARY') {
      const promptChars = SYSTEM_PROMPT.length + userPrompt.length;
      const estimatedTokens = Math.ceil(promptChars / 4);
      const topSentCount = context.analysisMode === 'SCARCITY' ? 0
        : context.analysisMode === 'SATURATED' ? Math.min(1, context.top.length)
        : Math.min(2, context.top.length);
      logger.info({
        event: 'summary_prompt_stats',
        requestId,
        analysisMode: context.analysisMode,
        promptChars,
        estimatedTokens,
        topSentCount
      });
    }

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

    if (context.type === 'SUMMARY') {
      const tMs = Date.now();
      logger.info({ event: 'summary_llm_start', requestId, analysisMode: context.analysisMode, tMs });
      const sumCtx = context as AssistantSummaryContext;
      const top = sumCtx.top ?? [];
      logger.info({
        event: 'assistant_llm_input_snapshot',
        requestId,
        type: 'SUMMARY',
        requestedLanguage,
        queryLen: sumCtx.query?.length ?? 0,
        queryPreview: preview(sumCtx.query, 80),
        analysisMode: sumCtx.analysisMode,
        nextStepHint: 'completeJSON',
        topNamesCount: top.length,
        topNamesPreview: top.slice(0, 4).map((t) => t?.name ?? ''),
        topMetaCount: top.length,
        topMetaKeys: top.slice(0, 4).map((t) => keys(t))
      });
    }
    const summaryLlmStart = Date.now();

    const result = await llmProvider.completeJSON(
      messages,
      AssistantOutputSchema,
      llmOpts,
      ASSISTANT_JSON_SCHEMA
    );

    if (context.type === 'SUMMARY') {
      const tMs = Date.now();
      logger.info({ event: 'summary_llm_done', requestId, dtMs: tMs - summaryLlmStart, tMs });
    }

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

    if (context.type === 'SUMMARY') {
      summaryGenStateByRequestId.set(requestId, 'DONE');
    }

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

    if (context.type === 'SUMMARY') {
      summaryGenStateByRequestId.set(requestId, 'DONE');
      logger.info({ event: 'summary_gen_done_on_failure', requestId }, '[ASSISTANT] SUMMARY state set to DONE after failure to avoid retry storms');
    }

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
      blocksSearch: fallback.blocksSearch,
      ...(context.type === 'SUMMARY' && {
        _summaryEmitSource: 'fallback' as const,
        _summaryEmitReason: 'assistant_llm_failed'
      })
    } as AssistantOutput;
  }
}

/**
 * Generate message-only plain text (no JSON). Uses MESSAGE_ONLY prompt + complete().
 * For SATURATED final message after Google results.
 */
export async function generateMessageOnlyText(
  context: AssistantContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts?: { traceId?: string; sessionId?: string; timeout?: number }
): Promise<string> {
  const userPrompt = buildUserPromptMessageOnly(context);
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT_MESSAGE_ONLY },
    { role: 'user' as const, content: userPrompt }
  ];
  const llmOpts = buildLLMOptions('assistant', {
    temperature: 0.7,
    requestId,
    stage: 'assistant_llm',
    promptLength: messages.reduce((sum, m) => sum + m.content.length, 0)
  });
  if (opts?.timeout) (llmOpts as any).timeout = opts.timeout;
  if (opts?.traceId) (llmOpts as any).traceId = opts.traceId;
  if (opts?.sessionId) (llmOpts as any).sessionId = opts.sessionId;
  const text = await llmProvider.complete(messages, llmOpts as any);
  return (text ?? '').trim();
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
      top: (context as any).top?.length,
      analysisMode: (context as any).analysisMode,
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
