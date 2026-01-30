/**
 * LLM Configuration
 * 
 * Centralized configuration for LLM models and timeouts per purpose.
 * Reads from environment variables with sensible defaults.
 * 
 * Environment variables:
 * - LLM_DEFAULT_MODEL (required fallback, defaults to gpt-4o-mini)
 * - GATE_MODEL, INTENT_MODEL, BASE_FILTERS_MODEL, ROUTE_MAPPER_MODEL, ASSISTANT_MODEL (optional overrides)
 * - LLM_DEFAULT_TIMEOUT_MS (optional, defaults to 5000ms)
 * - GATE_TIMEOUT_MS, INTENT_TIMEOUT_MS, BASE_FILTERS_TIMEOUT_MS, ROUTE_MAPPER_TIMEOUT_MS, ASSISTANT_TIMEOUT_MS (optional overrides)
 */

import type { LLMPurpose } from './llm-purpose.js';

export interface LLMConfig {
  defaultModel: string;
  perPurposeModel: Partial<Record<LLMPurpose, string>>;
  defaultTimeoutMs: number;
  perPurposeTimeoutMs: Partial<Record<LLMPurpose, number>>;
}

/**
 * Default timeout values per purpose (used when no env override)
 */
const DEFAULT_TIMEOUTS: Record<LLMPurpose, number> = {
  gate: 2500,          // Fast classification, needs to be quick
  intent: 2500,        // Route decision, medium priority
  baseFilters: 2000,   // Simple extraction, fast
  routeMapper: 3500,   // Query mapping, more complex
  ranking_profile: 2500, // Ranking profile selection, similar to intent
  assistant: 3000      // Assistant messages (GATE_FAIL, CLARIFY, SUMMARY, SEARCH_FAILED)
};

/**
 * Load LLM configuration from environment variables
 */
export function loadLLMConfig(): LLMConfig {
  // Default model (fallback for all purposes) - filter out empty strings
  let defaultModel = 'gpt-4o-mini';
  if (process.env.LLM_DEFAULT_MODEL && process.env.LLM_DEFAULT_MODEL.trim()) {
    defaultModel = process.env.LLM_DEFAULT_MODEL.trim();
  } else if (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.trim()) {
    defaultModel = process.env.OPENAI_MODEL.trim();
  }

  // Per-purpose model overrides (only set if non-empty)
  const perPurposeModel: Partial<Record<LLMPurpose, string>> = {};
  if (process.env.GATE_MODEL && process.env.GATE_MODEL.trim()) {
    perPurposeModel.gate = process.env.GATE_MODEL.trim();
  }
  if (process.env.INTENT_MODEL && process.env.INTENT_MODEL.trim()) {
    perPurposeModel.intent = process.env.INTENT_MODEL.trim();
  }
  if (process.env.BASE_FILTERS_MODEL && process.env.BASE_FILTERS_MODEL.trim()) {
    perPurposeModel.baseFilters = process.env.BASE_FILTERS_MODEL.trim();
  }
  if (process.env.ROUTE_MAPPER_MODEL && process.env.ROUTE_MAPPER_MODEL.trim()) {
    perPurposeModel.routeMapper = process.env.ROUTE_MAPPER_MODEL.trim();
  }
  if (process.env.ASSISTANT_MODEL && process.env.ASSISTANT_MODEL.trim()) {
    perPurposeModel.assistant = process.env.ASSISTANT_MODEL.trim();
  }
  if (process.env.RANKING_PROFILE_MODEL && process.env.RANKING_PROFILE_MODEL.trim()) {
    perPurposeModel.ranking_profile = process.env.RANKING_PROFILE_MODEL.trim();
  }

  // Default timeout (fallback for all purposes)
  let defaultTimeoutMs = 5000;
  if (process.env.LLM_DEFAULT_TIMEOUT_MS) {
    const parsed = parseInt(process.env.LLM_DEFAULT_TIMEOUT_MS, 10);
    if (!isNaN(parsed) && parsed > 0) {
      defaultTimeoutMs = parsed;
    }
  }

  // Per-purpose timeout overrides (only set if valid)
  const perPurposeTimeoutMs: Partial<Record<LLMPurpose, number>> = {};
  
  if (process.env.GATE_TIMEOUT_MS) {
    const parsed = parseInt(process.env.GATE_TIMEOUT_MS, 10);
    if (!isNaN(parsed)) perPurposeTimeoutMs.gate = parsed;
  }
  if (process.env.INTENT_TIMEOUT_MS) {
    const parsed = parseInt(process.env.INTENT_TIMEOUT_MS, 10);
    if (!isNaN(parsed)) perPurposeTimeoutMs.intent = parsed;
  }
  if (process.env.BASE_FILTERS_TIMEOUT_MS) {
    const parsed = parseInt(process.env.BASE_FILTERS_TIMEOUT_MS, 10);
    if (!isNaN(parsed)) perPurposeTimeoutMs.baseFilters = parsed;
  }
  if (process.env.ROUTE_MAPPER_TIMEOUT_MS) {
    const parsed = parseInt(process.env.ROUTE_MAPPER_TIMEOUT_MS, 10);
    if (!isNaN(parsed)) perPurposeTimeoutMs.routeMapper = parsed;
  }
  if (process.env.ASSISTANT_TIMEOUT_MS) {
    const parsed = parseInt(process.env.ASSISTANT_TIMEOUT_MS, 10);
    if (!isNaN(parsed)) perPurposeTimeoutMs.assistant = parsed;
  }
  if (process.env.RANKING_PROFILE_TIMEOUT_MS) {
    const parsed = parseInt(process.env.RANKING_PROFILE_TIMEOUT_MS, 10);
    if (!isNaN(parsed)) perPurposeTimeoutMs.ranking_profile = parsed;
  }

  return {
    defaultModel,
    perPurposeModel,
    defaultTimeoutMs,
    perPurposeTimeoutMs
  };
}

/**
 * Get default timeout for a purpose (used when no env override)
 */
export function getDefaultTimeoutForPurpose(purpose: LLMPurpose): number {
  return DEFAULT_TIMEOUTS[purpose];
}

/**
 * Cached configuration (loaded once on startup)
 */
let cachedConfig: LLMConfig | null = null;

/**
 * Get cached LLM configuration (loads once, reuses on subsequent calls)
 */
export function getLLMConfig(): LLMConfig {
  if (!cachedConfig) {
    cachedConfig = loadLLMConfig();
  }
  return cachedConfig;
}

/**
 * Clear cache (for testing purposes)
 */
export function clearLLMConfigCache(): void {
  cachedConfig = null;
}
