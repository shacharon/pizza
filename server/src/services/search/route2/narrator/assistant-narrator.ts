/**
 * Assistant Narrator Service
 * 
 * Generates UX-facing assistant messages via LLM with strict contracts.
 * 
 * HARD RULES:
 * - Assistant does NOT decide routing or trigger stages
 * - CLARIFY always STOP (blocksSearch=true)
 * - Output MUST be JSON validated with Zod
 * - On error/timeout → deterministic fallback (no crash)
 * - Max 240 chars, max 2 sentences
 */

import type { LLMProvider } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildLLMOptions } from '../../../../lib/llm/index.js';
import {
  type NarratorContext,
  type NarratorOutput,
  NarratorOutputSchema,
  NARRATOR_JSON_SCHEMA,
  NARRATOR_SCHEMA_HASH,
  getFallbackMessage
} from './narrator.types.js';
import {
  buildNarratorMessages,
  NARRATOR_PROMPT_VERSION,
  NARRATOR_PROMPT_HASH
} from './narrator.prompt.js';

/**
 * Generate assistant message via LLM
 * 
 * @param context - Narrator context (GATE_FAIL, CLARIFY, or SUMMARY)
 * @param llmProvider - LLM provider instance
 * @param requestId - Request ID for tracing
 * @param opts - Optional timeout/model overrides
 * @returns Validated narrator output or fallback on error
 */
export async function generateAssistantMessage(
  context: NarratorContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts?: {
    timeout?: number;
    model?: string;
    traceId?: string;
    sessionId?: string;
  }
): Promise<NarratorOutput> {
  const startTime = Date.now();

  try {
    // Build LLM messages
    const messages = buildNarratorMessages(context);

    logger.info(
      {
        requestId,
        stage: 'assistant_narrator',
        event: 'narrator_llm_start',
        type: context.type,
        reason: (context as any).reason,
        queryLen: context.query.length,
        language: context.language
      },
      '[NARRATOR] Calling LLM for assistant message'
    );

    // Build LLM options using purpose-based configuration
    const baseOpts: any = {
      temperature: 0.7, // Slight creativity for natural messages
      requestId,
      stage: 'assistant_narrator',
      promptVersion: NARRATOR_PROMPT_VERSION,
      promptHash: NARRATOR_PROMPT_HASH,
      promptLength: messages.reduce((sum, m) => sum + m.content.length, 0),
      schemaHash: NARRATOR_SCHEMA_HASH
    };
    if (opts?.traceId) baseOpts.traceId = opts.traceId;
    if (opts?.sessionId) baseOpts.sessionId = opts.sessionId;

    const llmOpts = buildLLMOptions('assistant', baseOpts);

    // Allow manual override of model/timeout if provided
    if (opts?.model) llmOpts.model = opts.model;
    if (opts?.timeout) llmOpts.timeout = opts.timeout;

    const result = await llmProvider.completeJSON(
      messages,
      NarratorOutputSchema,
      llmOpts,
      NARRATOR_JSON_SCHEMA
    );

    const durationMs = Date.now() - startTime;

    // Validate output constraints
    const output = result.data;

    // Enforce CLARIFY → blocksSearch=true
    if (output.type === 'CLARIFY' && !output.blocksSearch) {
      logger.warn(
        { requestId, stage: 'assistant_narrator', event: 'narrator_constraint_violation' },
        '[NARRATOR] LLM returned CLARIFY with blocksSearch=false, forcing true'
      );
      output.blocksSearch = true;
    }

    // Enforce question only for CLARIFY
    if (output.type !== 'CLARIFY' && output.question !== null) {
      logger.warn(
        { requestId, stage: 'assistant_narrator', event: 'narrator_constraint_violation' },
        '[NARRATOR] LLM returned question for non-CLARIFY type, nullifying'
      );
      output.question = null;
    }

    // Enforce question required for CLARIFY
    if (output.type === 'CLARIFY' && !output.question) {
      logger.warn(
        { requestId, stage: 'assistant_narrator', event: 'narrator_constraint_violation' },
        '[NARRATOR] LLM returned CLARIFY without question, using message as question'
      );
      output.question = output.message;
    }

    logger.info(
      {
        requestId,
        stage: 'assistant_narrator',
        event: 'narrator_llm_success',
        type: output.type,
        suggestedAction: output.suggestedAction,
        blocksSearch: output.blocksSearch,
        messageLen: output.message.length,
        hasQuestion: output.question !== null,
        durationMs,
        usage: result.usage,
        model: result.model
      },
      '[NARRATOR] LLM generated assistant message'
    );

    return output;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        requestId,
        stage: 'assistant_narrator',
        event: 'narrator_llm_failed',
        type: context.type,
        error: errorMsg,
        durationMs
      },
      '[NARRATOR] LLM call failed, using fallback'
    );

    // Return deterministic fallback (never crash)
    const fallback = getFallbackMessage(context);

    logger.info(
      {
        requestId,
        stage: 'assistant_narrator',
        event: 'narrator_fallback_used',
        type: fallback.type,
        suggestedAction: fallback.suggestedAction
      },
      '[NARRATOR] Using deterministic fallback message'
    );

    return fallback;
  }
}

/**
 * Validate narrator output post-generation
 * Enforces hard rules and returns corrected output
 */
export function validateNarratorOutput(output: NarratorOutput): NarratorOutput {
  const corrected = { ...output };

  // Rule 1: CLARIFY must block search
  if (corrected.type === 'CLARIFY') {
    corrected.blocksSearch = true;
  }

  // Rule 2: question only for CLARIFY
  if (corrected.type !== 'CLARIFY') {
    corrected.question = null;
  }

  // Rule 3: CLARIFY must have question
  if (corrected.type === 'CLARIFY' && !corrected.question) {
    corrected.question = corrected.message;
  }

  // Rule 4: Truncate message if too long
  if (corrected.message.length > 240) {
    corrected.message = corrected.message.substring(0, 237) + '...';
  }

  return corrected;
}
