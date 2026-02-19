/**
 * LLM Client
 * 
 * Thin wrapper around OpenAI LLM provider that uses purpose-based configuration.
 * Delegates to existing LLMProvider but resolves model+timeout automatically.
 */

import type { z } from 'zod';
import type { LLMProvider, Message, LLMCompletionResult } from '../../llm/types.js';
import type { LLMPurpose } from './llm-purpose.js';
import { resolveLLM } from './llm-resolver.js';

export interface LLMClientOptions {
  temperature?: number;
  maxOutputTokens?: number;
  traceId?: string;
  sessionId?: string;
  requestId?: string;
  stage?: string;
  promptVersion?: string;
  promptHash?: string;
  promptLength?: number;
  schemaHash?: string;
}

/**
 * Complete a JSON-structured LLM call with purpose-based configuration
 * 
 * @param provider - The LLM provider instance
 * @param purpose - The purpose of this LLM call (determines model+timeout)
 * @param messages - The conversation messages
 * @param schema - Zod schema for structured output validation
 * @param staticJsonSchema - Optional pre-computed JSON schema for OpenAI
 * @param opts - Additional options (temperature, tracing, etc.)
 * @returns Parsed and validated LLM response
 */
export async function completeJSONWithPurpose<T extends z.ZodTypeAny>(
  provider: LLMProvider,
  purpose: LLMPurpose,
  messages: Message[],
  schema: T,
  staticJsonSchema: any,
  opts?: LLMClientOptions
): Promise<LLMCompletionResult<z.infer<T>>> {
  // Resolve model and timeout for this purpose
  const { model, timeoutMs } = resolveLLM(purpose);

  // Build options object
  const llmOpts: any = {
    model,
    temperature: opts?.temperature ?? 0,
    timeout: timeoutMs,
    ...(opts?.traceId && { traceId: opts.traceId }),
    ...(opts?.sessionId && { sessionId: opts.sessionId }),
    ...(opts?.requestId && { requestId: opts.requestId }),
    ...(opts?.stage && { stage: opts.stage }),
    ...(opts?.promptVersion && { promptVersion: opts.promptVersion }),
    ...(opts?.promptHash && { promptHash: opts.promptHash }),
    ...(opts?.promptLength !== undefined && { promptLength: opts.promptLength }),
    ...(opts?.schemaHash && { schemaHash: opts.schemaHash })
  };

  // Call existing provider
  return provider.completeJSON(messages, schema, llmOpts, staticJsonSchema);
}

/**
 * Helper: Build LLM options object with purpose-based resolution
 * 
 * Use this for existing code that calls provider.completeJSON directly
 * but wants to use purpose-based model+timeout.
 * 
 * @param purpose - The purpose of this LLM call
 * @param baseOpts - Base options to merge with resolved config
 * @returns Merged options with model+timeout from purpose
 */
export function buildLLMOptions(purpose: LLMPurpose, baseOpts?: LLMClientOptions): any {
  const { model, timeoutMs } = resolveLLM(purpose);

  return {
    model,
    timeout: timeoutMs,
    temperature: baseOpts?.temperature ?? 0,
    ...(baseOpts?.traceId && { traceId: baseOpts.traceId }),
    ...(baseOpts?.sessionId && { sessionId: baseOpts.sessionId }),
    ...(baseOpts?.requestId && { requestId: baseOpts.requestId }),
    ...(baseOpts?.stage && { stage: baseOpts.stage }),
    ...(baseOpts?.promptVersion && { promptVersion: baseOpts.promptVersion }),
    ...(baseOpts?.promptHash && { promptHash: baseOpts.promptHash }),
    ...(baseOpts?.promptLength !== undefined && { promptLength: baseOpts.promptLength }),
    ...(baseOpts?.schemaHash && { schemaHash: baseOpts.schemaHash })
  };
}
