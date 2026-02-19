/**
 * LLM Resolver
 * 
 * Resolves the appropriate model and timeout for a given LLM purpose.
 * Applies per-purpose overrides or falls back to defaults.
 * Validates configuration to catch errors early.
 */

import type { LLMPurpose } from './llm-purpose.js';
import { getLLMConfig, getDefaultTimeoutForPurpose } from './llm-config.js';

export interface ResolvedLLM {
  model: string;
  timeoutMs: number;
}

/**
 * Resolve LLM model and timeout for a given purpose
 * 
 * Resolution order:
 * 1. Per-purpose override (e.g., GATE_MODEL, GATE_TIMEOUT_MS)
 * 2. Global default (LLM_DEFAULT_MODEL, LLM_DEFAULT_TIMEOUT_MS)
 * 3. Hardcoded defaults (gpt-4o-mini, purpose-specific timeouts)
 * 
 * @param purpose - The LLM purpose (gate, intent, baseFilters, routeMapper, assistant)
 * @returns Resolved model and timeout configuration
 * @throws Error if configuration is invalid (empty model or non-positive timeout)
 */
export function resolveLLM(purpose: LLMPurpose): ResolvedLLM {
  const config = getLLMConfig();

  // Resolve model: per-purpose override → default model
  const model = config.perPurposeModel[purpose] || config.defaultModel;

  // Resolve timeout: per-purpose override → purpose-specific default → global default
  const timeoutMs = 
    config.perPurposeTimeoutMs[purpose] || 
    getDefaultTimeoutForPurpose(purpose);

  // Validate configuration
  validateLLMConfig(purpose, model, timeoutMs);

  return { model, timeoutMs };
}

/**
 * Validate LLM configuration
 * Throws descriptive errors if configuration is invalid
 */
function validateLLMConfig(purpose: LLMPurpose, model: string, timeoutMs: number): void {
  // Validate model is non-empty
  if (!model || model.trim().length === 0) {
    throw new Error(
      `Invalid LLM configuration for purpose '${purpose}': model is empty. ` +
      `Set LLM_DEFAULT_MODEL or ${purpose.toUpperCase()}_MODEL environment variable.`
    );
  }

  // Validate timeout is positive
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      `Invalid LLM configuration for purpose '${purpose}': timeout must be positive, got ${timeoutMs}ms. ` +
      `Check ${purpose.toUpperCase()}_TIMEOUT_MS or LLM_DEFAULT_TIMEOUT_MS environment variable.`
    );
  }

  // Warn if timeout is suspiciously high (> 30s)
  if (timeoutMs > 30000) {
    console.warn(
      `[LLM Resolver] Warning: timeout for purpose '${purpose}' is very high (${timeoutMs}ms). ` +
      `This may cause performance issues.`
    );
  }

  // Warn if timeout is suspiciously low (< 500ms)
  if (timeoutMs < 500) {
    console.warn(
      `[LLM Resolver] Warning: timeout for purpose '${purpose}' is very low (${timeoutMs}ms). ` +
      `LLM calls may frequently timeout.`
    );
  }
}

/**
 * Get all resolved LLM configurations (for debugging/logging)
 */
export function getAllResolvedLLMs(): Record<LLMPurpose, ResolvedLLM> {
  const purposes: LLMPurpose[] = ['gate', 'intent', 'baseFilters', 'routeMapper', 'assistant'];
  const resolved: Partial<Record<LLMPurpose, ResolvedLLM>> = {};

  for (const purpose of purposes) {
    resolved[purpose] = resolveLLM(purpose);
  }

  return resolved as Record<LLMPurpose, ResolvedLLM>;
}
