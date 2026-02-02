/**
 * Ranking Invariant Enforcer
 * 
 * Pure policy enforcement: "missing intent => no scoring component"
 * 
 * Policy B: If a signal/context is not present, its weight must be 0.
 * This ensures scoring components only contribute when the relevant context exists.
 * 
 * Invariants:
 * 1. No cuisineKey OR no cuisineScores => cuisineMatch weight = 0
 * 2. No user location => distance weight = 0
 * 3. No openNow request => openBoost weight = 0
 */

import type { RankingWeights } from './ranking-profile.schema.js';

/**
 * Context for invariant enforcement
 */
export interface RankingContext {
  hasUserLocation: boolean;
  cuisineKey: string | null | undefined;
  openNowRequested: boolean | null | undefined;
  hasCuisineScores: boolean;
  requestId?: string;
}

/**
 * Invariant violation details
 */
export interface InvariantViolation {
  rule: 'NO_CUISINE_INTENT' | 'NO_CUISINE_SCORES' | 'NO_USER_LOCATION' | 'NO_OPEN_NOW_REQUESTED';
  component: 'cuisineMatch' | 'distance' | 'openBoost';
  originalWeight: number;
  enforcedWeight: number;
  message: string;
}

/**
 * Enforcement result
 */
export interface EnforcementResult {
  enforcedWeights: RankingWeights;
  violations: InvariantViolation[];
  appliedRules: string[];
}

/**
 * RankingInvariantEnforcer - Pure policy enforcement for ranking weights
 * 
 * Ensures that scoring components only contribute when the relevant context exists.
 * This is the SINGLE SOURCE OF TRUTH for all ranking invariants.
 */
export class RankingInvariantEnforcer {
  /**
   * Enforce all ranking invariants on the given weights
   * 
   * Returns new weights object with invariants applied (no mutation)
   * 
   * @param weights - Original ranking weights
   * @param context - Ranking context (user location, cuisine intent, etc.)
   * @returns Enforcement result with adjusted weights and violations
   */
  static enforce(weights: RankingWeights, context: RankingContext): EnforcementResult {
    // Start with a copy of the original weights (no mutation)
    const enforcedWeights: RankingWeights = { ...weights };
    const violations: InvariantViolation[] = [];

    // Invariant 1: No cuisineKey OR no cuisineScores => cuisineMatch weight = 0
    if ((!context.cuisineKey || !context.hasCuisineScores) && 
        enforcedWeights.cuisineMatch && 
        enforcedWeights.cuisineMatch > 0) {
      
      const originalWeight = enforcedWeights.cuisineMatch;
      const rule = !context.cuisineKey ? 'NO_CUISINE_INTENT' : 'NO_CUISINE_SCORES';
      const message = !context.cuisineKey 
        ? 'No cuisine intent specified - cuisine matching disabled'
        : 'No cuisine scores available in results - cuisine matching disabled';

      violations.push({
        rule,
        component: 'cuisineMatch',
        originalWeight,
        enforcedWeight: 0,
        message
      });

      enforcedWeights.cuisineMatch = 0;
    }

    // Invariant 2: No user location => distance weight = 0
    if (!context.hasUserLocation && enforcedWeights.distance > 0) {
      const originalWeight = enforcedWeights.distance;

      violations.push({
        rule: 'NO_USER_LOCATION',
        component: 'distance',
        originalWeight,
        enforcedWeight: 0,
        message: 'No user location available - distance scoring disabled'
      });

      enforcedWeights.distance = 0;
    }

    // Invariant 3: No openNow request => openBoost weight = 0
    if (!context.openNowRequested && enforcedWeights.openBoost > 0) {
      const originalWeight = enforcedWeights.openBoost;

      violations.push({
        rule: 'NO_OPEN_NOW_REQUESTED',
        component: 'openBoost',
        originalWeight,
        enforcedWeight: 0,
        message: 'No open-now filter requested - open boost disabled'
      });

      enforcedWeights.openBoost = 0;
    }

    // Extract applied rule names for logging
    const appliedRules = violations.map(v => `${v.rule} (${v.component})`);

    return {
      enforcedWeights,
      violations,
      appliedRules
    };
  }

  /**
   * Check invariants without enforcing (for validation/testing)
   * 
   * Returns list of violations that would be applied
   * 
   * @param weights - Ranking weights to check
   * @param context - Ranking context
   * @returns List of violations (empty if all invariants satisfied)
   */
  static checkInvariants(weights: RankingWeights, context: RankingContext): InvariantViolation[] {
    const result = this.enforce(weights, context);
    return result.violations;
  }

  /**
   * Validate that weights satisfy all invariants
   * 
   * @param weights - Ranking weights to validate
   * @param context - Ranking context
   * @returns True if all invariants are satisfied, false otherwise
   */
  static validate(weights: RankingWeights, context: RankingContext): boolean {
    const violations = this.checkInvariants(weights, context);
    return violations.length === 0;
  }

  /**
   * Get human-readable summary of enforcement results
   * 
   * @param result - Enforcement result
   * @returns Summary string
   */
  static summarize(result: EnforcementResult): string {
    if (result.violations.length === 0) {
      return 'All invariants satisfied - no enforcement needed';
    }

    const parts = result.violations.map(v => 
      `${v.component}: ${v.originalWeight} → ${v.enforcedWeight} (${v.rule})`
    );

    return `Applied ${result.violations.length} invariant(s): ${parts.join(', ')}`;
  }

  /**
   * Convert enforcement result to legacy format (for backward compatibility)
   * Used by orchestrator that expects the old logging format
   * 
   * @param result - Enforcement result
   * @returns Array of rule objects in legacy format
   */
  static toLegacyFormat(result: EnforcementResult): Array<{ rule: string; component: string; oldWeight: number }> {
    return result.violations.map(v => ({
      rule: v.rule,
      component: v.component,
      oldWeight: v.originalWeight
    }));
  }
}
