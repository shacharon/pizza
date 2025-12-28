/**
 * Failure Detector Service
 * Phase 7 Enhanced: Timeout and quota error detection
 * Deterministically computes failure reasons based on system state
 * Never uses LLM - pure business logic
 */

import type { RestaurantResult } from '../types/search.types.js';
import type { SearchResponseMeta } from '../types/search-response.dto.js';
import type { ParsedIntent, FailureReason } from '../types/search.types.js';

export class FailureDetectorService {
  /**
   * Compute failure reason based on deterministic rules
   * This is NOT done by LLM - it's code-based truth about system state
   * 
   * Phase 7: Enhanced with error object detection
   */
  computeFailureReason(
    results: RestaurantResult[],
    confidence: number,
    meta: Partial<SearchResponseMeta>,
    intent: ParsedIntent,
    error?: Error  // NEW: Accept error object for direct detection
  ): FailureReason {
    // Rule 0: Check error object directly (Phase 7)
    if (error) {
      if (isTimeoutError(error)) {
        return 'TIMEOUT';
      }
      if (isQuotaError(error)) {
        return 'QUOTA_EXCEEDED';
      }
    }
    
    // Rule 1: Check for API/system errors in meta
    if (meta.source?.toLowerCase().includes('error')) {
      if (meta.source.includes('timeout')) {
        return 'TIMEOUT';
      }
      if (meta.source.includes('quota')) {
        return 'QUOTA_EXCEEDED';
      }
      return 'GOOGLE_API_ERROR';
    }

    // Rule 2: Check for geocoding failures
    if (intent.location?.cityValidation === 'FAILED') {
      return 'GEOCODING_FAILED';
    }

    // Rule 3: Check for no results
    if (results.length === 0 && meta.cached !== true) {
      return 'NO_RESULTS';
    }

    // Rule 4: Check for low confidence parse
    if (confidence < 0.5) {
      return 'LOW_CONFIDENCE';
    }

    // Rule 5: Check if live data was requested but not verified
    // Phase 2: Enhanced check - verify top results don't have UNKNOWN status
    if (intent.requiresLiveData) {
      // Check if live data verification failed
      if (meta.liveData?.openingHoursVerified === false) {
        // Additional check: if we have results, ensure they have verified status
        if (results.length > 0) {
          const topResults = results.slice(0, 3);
          const hasUnknownStatus = topResults.some(r => r.openNow === 'UNKNOWN');
          
          if (hasUnknownStatus) {
            return 'LIVE_DATA_UNAVAILABLE';
          }
        } else {
          // No results, so we can't verify live data
          return 'LIVE_DATA_UNAVAILABLE';
        }
      }
    }

    // Rule 6: Check for weak matches (low quality results)
    if (results.length > 0 && results.length < 3 && confidence < 0.7) {
      return 'WEAK_MATCHES';
    }

    // Rule 7: Check if city validation is ambiguous
    if (intent.location?.cityValidation === 'AMBIGUOUS') {
      return 'GEOCODING_FAILED';  // Treat ambiguous as failed for assistant purposes
    }

    // No failure detected
    return 'NONE';
  }

  /**
   * Get human-readable description of failure reason (for debugging)
   */
  getFailureDescription(reason: FailureReason): string {
    switch (reason) {
      case 'NONE':
        return 'No failure detected';
      case 'NO_RESULTS':
        return 'No results found for query';
      case 'LOW_CONFIDENCE':
        return 'Low confidence in understanding user query';
      case 'GEOCODING_FAILED':
        return 'Could not verify or find the requested location';
      case 'GOOGLE_API_ERROR':
        return 'Error communicating with Google Places API';
      case 'TIMEOUT':
        return 'Request timed out';
      case 'QUOTA_EXCEEDED':
        return 'API quota exceeded';
      case 'LIVE_DATA_UNAVAILABLE':
        return 'Live data (opening hours) could not be verified';
      case 'WEAK_MATCHES':
        return 'Found results but quality/relevance is low';
      default:
        return 'Unknown failure reason';
    }
  }

  /**
   * Determine if this failure is critical (should show recovery mode)
   */
  isCriticalFailure(reason: FailureReason): boolean {
    const criticalReasons: FailureReason[] = [
      'NO_RESULTS',
      'GOOGLE_API_ERROR',
      'TIMEOUT',
      'QUOTA_EXCEEDED'
    ];
    return criticalReasons.includes(reason);
  }
}

// ============================================================================
// Phase 7: Error Detection Helpers
// ============================================================================

/**
 * Check if error is a timeout error
 * Detects TimeoutError from timeout-guard.ts
 */
export function isTimeoutError(error: Error): boolean {
  return (
    error.name === 'TimeoutError' ||
    error.message.toLowerCase().includes('timed out') ||
    error.message.toLowerCase().includes('timeout')
  );
}

/**
 * Check if error is a quota/rate limit error
 * Detects various quota error patterns from Google APIs
 */
export function isQuotaError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    error.name === 'QuotaExceededError' ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('429') || // HTTP status code
    msg.includes('resource exhausted')
  );
}

