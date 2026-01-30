/**
 * Search Response Mapper
 * Pure functions for transforming API responses to view models
 * 
 * Responsibility:
 * - Normalize API response structure
 * - Extract and compute derived properties
 * - Provide safe defaults for optional fields
 */

import type { SearchResponse, Restaurant, ResultGroup } from '../types/search.types';

/**
 * Flatten grouped results to a single array
 * Preserves backend ordering
 * 
 * @param groups - Result groups from API
 * @returns Flattened array of restaurants
 * 
 * @example
 * flattenResultGroups([
 *   { kind: 'EXACT', results: [r1, r2] },
 *   { kind: 'NEARBY', results: [r3, r4] }
 * ])
 * // => [r1, r2, r3, r4]
 */
export function flattenResultGroups(groups: ResultGroup[] | undefined): Restaurant[] {
  if (!groups || groups.length === 0) return [];
  return groups.flatMap(g => g.results);
}

/**
 * Extract exact match results from grouped response
 * 
 * @param groups - Result groups from API
 * @returns Array of exact match restaurants
 */
export function extractExactResults(groups: ResultGroup[] | undefined): Restaurant[] {
  if (!groups) return [];
  const exactGroup = groups.find(g => g.kind === 'EXACT');
  return exactGroup?.results || [];
}

/**
 * Extract nearby results from grouped response
 * 
 * @param groups - Result groups from API
 * @returns Array of nearby restaurants
 */
export function extractNearbyResults(groups: ResultGroup[] | undefined): Restaurant[] {
  if (!groups) return [];
  const nearbyGroup = groups.find(g => g.kind === 'NEARBY');
  return nearbyGroup?.results || [];
}

/**
 * Check if response requires clarification
 * 
 * @param response - Search response from API
 * @returns true if user input needed
 */
export function requiresClarification(response: SearchResponse | null): boolean {
  if (!response) return false;
  return response.requiresClarification === true;
}

/**
 * Check if response has results
 * 
 * @param response - Search response from API
 * @returns true if results exist
 */
export function hasResults(response: SearchResponse | null): boolean {
  if (!response) return false;
  return response.results && response.results.length > 0;
}

/**
 * Get confidence level from response metadata
 * Provides safe default of 1.0 (100% confidence)
 * 
 * @param response - Search response from API
 * @returns Confidence score (0-1)
 */
export function getConfidence(response: SearchResponse | null): number {
  if (!response || !response.meta) return 1.0;
  return response.meta.confidence ?? 1.0;
}

/**
 * Check if confidence is below threshold
 * Used to trigger recovery/assist mode
 * 
 * @param response - Search response from API
 * @param threshold - Confidence threshold (default 0.6)
 * @returns true if confidence is low
 */
export function isLowConfidence(
  response: SearchResponse | null,
  threshold: number = 0.6
): boolean {
  const confidence = getConfidence(response);
  return confidence < threshold;
}

/**
 * Extract applied filters from response metadata
 * 
 * @param response - Search response from API
 * @returns Array of applied filter IDs
 */
export function getAppliedFilters(response: SearchResponse | null): string[] {
  if (!response || !response.meta) return [];
  return response.meta.appliedFilters || [];
}

/**
 * Check if specific filter is applied
 * 
 * @param response - Search response from API
 * @param filterId - Filter ID to check (e.g., 'open_now')
 * @returns true if filter is applied
 */
export function isFilterApplied(
  response: SearchResponse | null,
  filterId: string
): boolean {
  const appliedFilters = getAppliedFilters(response);
  return appliedFilters.includes(filterId);
}

/**
 * Get assist mode from response
 * 
 * @param response - Search response from API
 * @returns Assist mode or 'NORMAL' as default
 */
export function getAssistMode(
  response: SearchResponse | null
): 'NORMAL' | 'RECOVERY' | 'CLARIFY' {
  if (!response || !response.assist) return 'NORMAL';
  return response.assist.mode || 'NORMAL';
}

/**
 * Check if response indicates pipeline stopped
 * Used for DONE_STOPPED state
 * 
 * @param response - Search response from API
 * @returns true if pipeline stopped early
 */
export function isPipelineStopped(response: SearchResponse | null): boolean {
  if (!response || !response.meta) return false;
  return response.meta.source === 'route2_gate_stop' ||
    response.meta.failureReason === 'LOW_CONFIDENCE';
}
