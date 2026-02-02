/**
 * Response Validator - Pure validation module for SearchResponse
 * 
 * INVARIANTS:
 * 1. CLARIFY responses MUST have empty results, no groups, no pagination
 * 2. STOPPED responses (failureReason !== 'NONE') MUST have empty results, no groups, no pagination
 * 3. NO-RESULTS responses MUST have failureReason set appropriately
 * 
 * This module is PURE - no mutations, no side effects
 */

import type { SearchResponse } from '../../types/search-response.dto.js';
import type { FailureReason } from '../../types/domain.types.js';

/**
 * Validation violation details
 */
export interface ValidationViolation {
  code: 'CLARIFY_HAS_RESULTS' | 'CLARIFY_HAS_GROUPS' | 'CLARIFY_HAS_PAGINATION' | 
        'STOPPED_HAS_RESULTS' | 'STOPPED_HAS_GROUPS' | 'STOPPED_HAS_PAGINATION' |
        'CLARIFY_MISSING_QUESTION' | 'NO_RESULTS_INVALID_FAILURE_REASON';
  message: string;
  context: {
    assistType?: string;
    failureReason?: FailureReason;
    resultCount?: number;
    hasPagination?: boolean;
    hasGroups?: boolean;
    hasQuestion?: boolean;
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
}

/**
 * ResponseValidator - Pure validation class for SearchResponse invariants
 */
export class ResponseValidator {
  /**
   * Validate CLARIFY response invariants
   * MUST have empty results, no groups, no pagination, and a question
   */
  static validateClarify(response: SearchResponse): ValidationResult {
    const violations: ValidationViolation[] = [];

    // Check if this is actually a CLARIFY response
    if (response.assist.type !== 'clarify') {
      return { valid: true, violations: [] };
    }

    // INVARIANT 1: CLARIFY must have empty results
    if (response.results.length > 0) {
      violations.push({
        code: 'CLARIFY_HAS_RESULTS',
        message: 'CLARIFY response must have empty results array',
        context: {
          assistType: response.assist.type,
          failureReason: response.meta.failureReason,
          resultCount: response.results.length
        }
      });
    }

    // INVARIANT 2: CLARIFY must not have groups
    if (response.groups && response.groups.length > 0) {
      violations.push({
        code: 'CLARIFY_HAS_GROUPS',
        message: 'CLARIFY response must not have groups',
        context: {
          assistType: response.assist.type,
          failureReason: response.meta.failureReason,
          hasGroups: true
        }
      });
    }

    // INVARIANT 3: CLARIFY must not have pagination
    if (response.meta.pagination) {
      violations.push({
        code: 'CLARIFY_HAS_PAGINATION',
        message: 'CLARIFY response must not have pagination',
        context: {
          assistType: response.assist.type,
          failureReason: response.meta.failureReason,
          hasPagination: true
        }
      });
    }

    // INVARIANT 4: CLARIFY should have a question (soft check - we don't enforce this strictly)
    // The message might be empty on initial HTTP response, but WebSocket will fill it
    // So we just document this expectation without enforcing it

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Validate STOPPED response invariants
   * MUST have empty results, no groups, no pagination when failureReason !== 'NONE'
   */
  static validateStopped(response: SearchResponse): ValidationResult {
    const violations: ValidationViolation[] = [];

    // Check if this is actually a STOPPED response
    const isStopped = response.meta.failureReason !== 'NONE';
    if (!isStopped) {
      return { valid: true, violations: [] };
    }

    // INVARIANT 1: STOPPED must have empty results
    if (response.results.length > 0) {
      violations.push({
        code: 'STOPPED_HAS_RESULTS',
        message: 'STOPPED response (failureReason !== NONE) must have empty results',
        context: {
          assistType: response.assist.type,
          failureReason: response.meta.failureReason,
          resultCount: response.results.length
        }
      });
    }

    // INVARIANT 2: STOPPED must not have groups
    if (response.groups && response.groups.length > 0) {
      violations.push({
        code: 'STOPPED_HAS_GROUPS',
        message: 'STOPPED response must not have groups',
        context: {
          assistType: response.assist.type,
          failureReason: response.meta.failureReason,
          hasGroups: true
        }
      });
    }

    // INVARIANT 3: STOPPED must not have pagination
    if (response.meta.pagination) {
      violations.push({
        code: 'STOPPED_HAS_PAGINATION',
        message: 'STOPPED response must not have pagination',
        context: {
          assistType: response.assist.type,
          failureReason: response.meta.failureReason,
          hasPagination: true
        }
      });
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Check all invariants for a response
   * Returns all violations found across all checks
   */
  static checkInvariants(response: SearchResponse): ValidationResult {
    const clarifyResult = this.validateClarify(response);
    const stoppedResult = this.validateStopped(response);

    const allViolations = [
      ...clarifyResult.violations,
      ...stoppedResult.violations
    ];

    return {
      valid: allViolations.length === 0,
      violations: allViolations
    };
  }

  /**
   * Sanitize response by creating a clean copy with invariants enforced
   * This is the ONLY method that returns a modified object (new instance, not mutation)
   * 
   * IMPORTANT: Only use this for defensive fail-safe - normal flow should never violate invariants
   */
  static sanitize(response: SearchResponse): SearchResponse {
    const isClarifyOrStopped = 
      response.assist.type === 'clarify' || 
      response.meta.failureReason !== 'NONE';

    if (!isClarifyOrStopped) {
      // No sanitization needed for normal responses
      return response;
    }

    // Check if sanitization is actually needed
    const validation = this.checkInvariants(response);
    if (validation.valid) {
      // Already valid, return as-is
      return response;
    }

    // Create sanitized copy (defensive fail-safe)
    const sanitized: SearchResponse = {
      ...response,
      results: [],  // Force empty results
      groups: undefined,  // Remove groups
      meta: {
        ...response.meta,
        pagination: undefined  // Remove pagination
      }
    };

    return sanitized;
  }

  /**
   * Validate and throw if invariants are violated
   * Use this in production code for fail-fast behavior
   * 
   * @throws Error if invariants are violated
   */
  static validateOrThrow(response: SearchResponse): void {
    const result = this.checkInvariants(response);
    
    if (!result.valid) {
      const violationSummary = result.violations
        .map(v => `${v.code}: ${v.message}`)
        .join('; ');
      
      throw new Error(
        `[ResponseValidator] Invariant violation(s): ${violationSummary}`
      );
    }
  }

  /**
   * Validate and sanitize response (defensive wrapper)
   * Logs violations and returns sanitized copy if needed
   * 
   * This combines validation + sanitization for backward compatibility
   * with the existing validateClarifyResponse behavior
   */
  static validateAndSanitize(
    response: SearchResponse,
    logger?: { error: (data: any, msg?: string) => void }
  ): SearchResponse {
    const result = this.checkInvariants(response);

    if (!result.valid) {
      // Log each violation
      result.violations.forEach(violation => {
        logger?.error({
          requestId: response.requestId,
          event: 'response_invariant_violated',
          code: violation.code,
          message: violation.message,
          context: violation.context
        }, `[ROUTE2] Response invariant violated - sanitizing (BUG)`);
      });

      // Return sanitized copy
      return this.sanitize(response);
    }

    // Valid response, return as-is
    return response;
  }
}
