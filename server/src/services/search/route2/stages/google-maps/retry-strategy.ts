/**
 * Retry Strategy
 * Low-result retry logic with bias relaxation for Google Places Text Search
 * 
 * Responsibility:
 * - Detect low-result scenarios requiring retry
 * - Generate retry mapping (e.g., remove bias)
 * - Decide whether to use retry results or original results
 * 
 * Strategy:
 * - If results <= 1 AND bias was applied: retry without bias for broader results
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import type { RouteLLMMapping } from '../../types.js';

export interface RetryDecision {
  shouldRetry: boolean;
  reason?: string;
  originalBias?: any;
}

export interface RetryResult {
  results: any[];
  strategyUsed: string;
  wasRetried: boolean;
  beforeCount: number;
  afterCount: number;
  improvement: number;
}

/**
 * Determine if retry is needed based on result count and mapping
 */
export function shouldRetryLowResults(
  results: any[],
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>
): RetryDecision {
  // Retry only if: low results (<=1) AND bias was applied
  if (results.length <= 1 && mapping.bias) {
    return {
      shouldRetry: true,
      reason: 'low_results_with_bias',
      originalBias: mapping.bias
    };
  }

  return { shouldRetry: false };
}

/**
 * Generate retry mapping by removing bias
 */
export function generateRetryMapping(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>
): Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> {
  return {
    ...mapping,
    bias: undefined
  };
}

/**
 * Execute retry with provided strategy and select best results
 */
export async function executeRetryStrategy(
  originalResults: any[],
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  retryFn: (retryMapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>) => Promise<any[]>,
  requestId: string
): Promise<RetryResult> {
  const decision = shouldRetryLowResults(originalResults, mapping);

  if (!decision.shouldRetry) {
    return {
      results: originalResults,
      strategyUsed: 'none',
      wasRetried: false,
      beforeCount: originalResults.length,
      afterCount: originalResults.length,
      improvement: 0
    };
  }

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'searchText',
    event: 'textsearch_retry_low_results',
    beforeCount: originalResults.length,
    reason: decision.reason,
    originalBias: decision.originalBias,
    originalTextQuery: mapping.textQuery,
    originalLanguage: mapping.language
  }, '[GOOGLE] Low results detected, retrying with bias removed');

  // Generate retry mapping
  const retryMapping = generateRetryMapping(mapping);

  // Execute retry
  const retryResults = await retryFn(retryMapping);

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'searchText',
    event: 'textsearch_retry_completed',
    beforeCount: originalResults.length,
    afterCount: retryResults.length,
    strategyUsed: 'removed_bias',
    improvement: retryResults.length - originalResults.length
  }, '[GOOGLE] Retry completed');

  // Select best results (prefer retry if better)
  const finalResults = retryResults.length > originalResults.length ? retryResults : originalResults;

  return {
    results: finalResults,
    strategyUsed: 'removed_bias',
    wasRetried: true,
    beforeCount: originalResults.length,
    afterCount: retryResults.length,
    improvement: retryResults.length - originalResults.length
  };
}
