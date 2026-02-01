/**
 * Assistant LLM Client
 * Orchestrates LLM calls with validation and error handling
 * 
 * Responsibility: Thin orchestrator that ties together:
 * - Prompt generation (PromptEngine)
 * - LLM provider calls
 * - Output validation and invariant enforcement (ValidationEngine)
 */

import type { LLMProvider } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildLLMOptions } from '../../../../lib/llm/index.js';
import type { AssistantContext, AssistantOutput } from './assistant.types.js';
import {
  AssistantOutputSchema,
  ASSISTANT_JSON_SCHEMA,
  ASSISTANT_SCHEMA_VERSION,
  ASSISTANT_PROMPT_VERSION,
  ASSISTANT_SCHEMA_HASH
} from './assistant.types.js';
import { AssistantPromptEngine } from './prompt-engine.js';
import { AssistantValidationEngine } from './validation-engine.js';
import { getDeterministicFallback } from './fallback-generator.js';

export interface GenerationOptions {
  timeout?: number;
  model?: string;
  traceId?: string;
  sessionId?: string;
}

/**
 * Assistant LLM Client
 * Main orchestrator for assistant message generation
 */
export class AssistantLLMClient {
  private promptEngine: AssistantPromptEngine;
  private validationEngine: AssistantValidationEngine;

  constructor(
    promptEngine?: AssistantPromptEngine,
    validationEngine?: AssistantValidationEngine
  ) {
    this.promptEngine = promptEngine || new AssistantPromptEngine();
    this.validationEngine = validationEngine || new AssistantValidationEngine();
  }

  /**
   * Generate assistant message via LLM
   * With deterministic validation, invariant enforcement, and fallback
   */
  async generateMessage(
    context: AssistantContext,
    llmProvider: LLMProvider,
    requestId: string,
    opts?: GenerationOptions
  ): Promise<AssistantOutput> {
    const startTime = Date.now();
    const questionLanguage = context.language === 'other' ? 'en' : context.language;

    try {
      const messages = [
        { role: 'system' as const, content: this.promptEngine.buildSystemPrompt() },
        { role: 'user' as const, content: this.promptEngine.buildUserPrompt(context) }
      ];

      logger.info({
        requestId,
        stage: 'assistant_llm',
        event: 'assistant_llm_start',
        type: context.type,
        reason: (context as any).reason,
        questionLanguage,
        queryLen: context.query.length,
        schemaVersion: ASSISTANT_SCHEMA_VERSION,
        promptVersion: ASSISTANT_PROMPT_VERSION
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

      // CORRECTNESS FIX: Always emit promptVersion and schemaHash for telemetry
      (llmOpts as any).promptVersion = ASSISTANT_PROMPT_VERSION;
      (llmOpts as any).schemaHash = ASSISTANT_SCHEMA_HASH;

      const result = await llmProvider.completeJSON(
        messages,
        AssistantOutputSchema,
        llmOpts,
        ASSISTANT_JSON_SCHEMA
      );

      const durationMs = Date.now() - startTime;

      // STEP 1: Enforce type-specific invariants (hard-coded business rules)
      const withInvariants = this.validationEngine.enforceInvariants(result.data, context, requestId);

      // STEP 2: Validate and enforce correctness (language + format)
      const validated = this.validationEngine.validateAndCorrect(
        withInvariants,
        questionLanguage,
        context,
        requestId
      );

      logger.info({
        requestId,
        stage: 'assistant_llm',
        event: 'assistant_llm_success',
        type: validated.type,
        questionLanguage,
        suggestedAction: validated.suggestedAction,
        blocksSearch: validated.blocksSearch, // Log final value after enforcement
        durationMs,
        usage: result.usage,
        model: result.model
      }, '[ASSISTANT] LLM generated and validated message');

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
        questionLanguage,
        error: errorMsg,
        isTimeout,
        durationMs
      }, '[ASSISTANT] LLM call failed - using deterministic fallback');

      // Use deterministic fallback on LLM error/timeout
      const fallback = getDeterministicFallback(context, questionLanguage);

      return {
        type: context.type,
        message: fallback.message,
        question: fallback.question,
        suggestedAction: fallback.suggestedAction,
        blocksSearch: fallback.blocksSearch,
        language: questionLanguage, // Set language from requested
        outputLanguage: questionLanguage // Set outputLanguage from requested
      };
    }
  }
}
