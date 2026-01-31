/**
 * Relax Policy - Route2
 * 
 * Deterministic policy for relaxing soft filters when candidate pool yields too few results.
 * Applied ONLY when reusing candidate pool (not on Google requery).
 * 
 * Relaxation Order (most restrictive first):
 * 1. openState=OPEN_NOW → null (most common filter that removes results)
 * 2. dietary filters → null (gluten-free ONLY; kosher is HARD and never relaxed)
 * 3. minRatingBucket → null (relax rating requirement)
 * 
 * HARD CONSTRAINTS (NEVER auto-relaxed):
 * - kosher (isKosher=true): Religious dietary requirement
 * - meatDairy (cuisineKey='meat'|'dairy'): Kosher meat/dairy separation
 * 
 * Note: Radius widening is NOT part of relax policy (requires Google requery).
 * Max 2 relaxation attempts to avoid over-relaxation.
 */

import type { FinalSharedFilters, OpenState, MinRatingBucket } from '../shared/shared-filters.types.js';
import type { HardConstraintField, HardConstraintOverrides } from '../shared/hard-constraints.types.js';
import { isHardConstraint, getHardConstraintReason } from '../shared/hard-constraints.types.js';

export interface RelaxStep {
  step: number;
  field: string;
  from: any;
  to: any;
  reason: string;
}

export interface RelaxDenied {
  field: string;
  reason: string;
  reasonCode: string;
}

export interface RelaxResult {
  relaxed: boolean;
  nextFilters: FinalSharedFilters;
  steps: RelaxStep[];
  denied: RelaxDenied[];
  attemptedFields: string[];
}

/**
 * Relax filters if too few candidates remain after filtering
 * 
 * @param candidatesAfterFilter Number of candidates remaining after current filters
 * @param currentFilters Current filter configuration
 * @param attempt Current relaxation attempt (0-based)
 * @param minAcceptable Minimum acceptable number of candidates (default: 5)
 * @param hardConstraints List of active hard constraint field names (never relaxed)
 * @param overrides User override flags to allow relaxing hard constraints (optional)
 * @returns Relaxation result with updated filters
 */
export function relaxIfTooFew(
  candidatesAfterFilter: number,
  currentFilters: FinalSharedFilters,
  attempt: number = 0,
  minAcceptable: number = 5,
  hardConstraints: HardConstraintField[] = [],
  overrides?: HardConstraintOverrides
): RelaxResult {
  const MAX_ATTEMPTS = 2;

  // No relaxation needed
  if (candidatesAfterFilter >= minAcceptable) {
    return {
      relaxed: false,
      nextFilters: currentFilters,
      steps: [],
      denied: [],
      attemptedFields: []
    };
  }

  // Max attempts reached
  if (attempt >= MAX_ATTEMPTS) {
    return {
      relaxed: false,
      nextFilters: currentFilters,
      steps: [],
      denied: [],
      attemptedFields: []
    };
  }

  const steps: RelaxStep[] = [];
  const denied: RelaxDenied[] = [];
  const attemptedFields: string[] = [];
  const nextFilters = { ...currentFilters };
  let relaxed = false;

  // Step 1: Relax openState=OPEN_NOW (most common restriction)
  if (currentFilters.openState === 'OPEN_NOW') {
    attemptedFields.push('openState');
    steps.push({
      step: 1,
      field: 'openState',
      from: 'OPEN_NOW',
      to: null,
      reason: 'too_few_open_now_results'
    });
    nextFilters.openState = null;
    relaxed = true;
  }
  // Also relax openAt/openBetween if present
  else if (currentFilters.openAt !== null) {
    attemptedFields.push('openAt');
    steps.push({
      step: 1,
      field: 'openAt',
      from: currentFilters.openAt,
      to: null,
      reason: 'too_few_openAt_results'
    });
    nextFilters.openAt = null;
    relaxed = true;
  }
  else if (currentFilters.openBetween !== null) {
    attemptedFields.push('openBetween');
    steps.push({
      step: 1,
      field: 'openBetween',
      from: currentFilters.openBetween,
      to: null,
      reason: 'too_few_openBetween_results'
    });
    nextFilters.openBetween = null;
    relaxed = true;
  }

  // Step 2: Relax dietary filters (if Step 1 already applied or not applicable)
  // IMPORTANT: kosher is a HARD constraint and NEVER relaxed (unless explicitly overridden)
  if (!relaxed && (currentFilters as any).isKosher === true) {
    attemptedFields.push('isKosher');

    // Check if kosher is a hard constraint
    if (isHardConstraint('isKosher', hardConstraints)) {
      // Refuse to relax (hard constraint)
      denied.push({
        field: 'isKosher',
        reason: 'Hard constraint - religious dietary requirement',
        reasonCode: getHardConstraintReason('isKosher')
      });
      // Do NOT set relaxed=true, do NOT modify filter
    } else {
      // Soft constraint - can relax
      steps.push({
        step: 2,
        field: 'isKosher',
        from: true,
        to: null,
        reason: 'too_few_kosher_results'
      });
      (nextFilters as any).isKosher = null;
      relaxed = true;
    }
  }
  else if (!relaxed && (currentFilters as any).isGlutenFree === true) {
    attemptedFields.push('isGlutenFree');
    steps.push({
      step: 2,
      field: 'isGlutenFree',
      from: true,
      to: null,
      reason: 'too_few_gluten_free_results'
    });
    (nextFilters as any).isGlutenFree = null;
    relaxed = true;
  }

  // Step 3: Relax minRatingBucket (last resort)
  if (!relaxed && currentFilters.minRatingBucket !== null) {
    attemptedFields.push('minRatingBucket');
    steps.push({
      step: 3,
      field: 'minRatingBucket',
      from: currentFilters.minRatingBucket,
      to: null,
      reason: 'too_few_high_rated_results'
    });
    nextFilters.minRatingBucket = null;
    relaxed = true;
  }

  return {
    relaxed,
    nextFilters,
    steps,
    denied,
    attemptedFields
  };
}

/**
 * Apply multiple relaxation attempts until minAcceptable candidates found
 * or max attempts reached
 * 
 * @param candidatesPool Full candidate pool (before soft filtering)
 * @param currentFilters Current filter configuration
 * @param filterFn Function to apply filters to pool
 * @param minAcceptable Minimum acceptable number of candidates
 * @param hardConstraints List of active hard constraint field names (never relaxed)
 * @param overrides User override flags to allow relaxing hard constraints (optional)
 * @returns Final relaxed filters and candidates
 */
export function applyRelaxationCascade(
  candidatesPool: any[],
  currentFilters: FinalSharedFilters,
  filterFn: (pool: any[], filters: FinalSharedFilters) => any[],
  minAcceptable: number = 5,
  hardConstraints: HardConstraintField[] = [],
  overrides?: HardConstraintOverrides
): {
  finalFilters: FinalSharedFilters;
  finalCandidates: any[];
  allSteps: RelaxStep[];
  allDenied: RelaxDenied[];
  attempts: number;
} {
  let filters = { ...currentFilters };
  let candidates = filterFn(candidatesPool, filters);
  let allSteps: RelaxStep[] = [];
  let allDenied: RelaxDenied[] = [];
  let attempts = 0;
  const MAX_ATTEMPTS = 2;

  while (candidates.length < minAcceptable && attempts < MAX_ATTEMPTS) {
    const relaxResult = relaxIfTooFew(
      candidates.length,
      filters,
      attempts,
      minAcceptable,
      hardConstraints,
      overrides
    );

    if (!relaxResult.relaxed) {
      // Track denied relaxations even if we couldn't relax
      allDenied.push(...relaxResult.denied);
      break; // No more relaxation possible
    }

    filters = relaxResult.nextFilters;
    allSteps.push(...relaxResult.steps);
    allDenied.push(...relaxResult.denied);
    attempts++;

    // Re-apply filters with relaxed configuration
    candidates = filterFn(candidatesPool, filters);
  }

  return {
    finalFilters: filters,
    finalCandidates: candidates,
    allSteps,
    allDenied,
    attempts
  };
}

/**
 * Check if filters can be relaxed further
 * Note: This does NOT account for hard constraints (used for optimistic checks)
 */
export function canRelaxFurther(filters: FinalSharedFilters): boolean {
  // Can relax if any of these are set
  return (
    filters.openState === 'OPEN_NOW' ||
    filters.openAt !== null ||
    filters.openBetween !== null ||
    (filters as any).isKosher === true ||
    (filters as any).isGlutenFree === true ||
    filters.minRatingBucket !== null
  );
}

/**
 * Check if filters can be relaxed further (accounting for hard constraints)
 * 
 * @param filters Current filter configuration
 * @param hardConstraints List of active hard constraint field names
 * @returns True if any soft constraint can be relaxed
 */
export function canRelaxFurtherSafe(
  filters: FinalSharedFilters,
  hardConstraints: HardConstraintField[]
): boolean {
  // Check opening hours (always soft)
  if (filters.openState === 'OPEN_NOW' || filters.openAt !== null || filters.openBetween !== null) {
    return true;
  }

  // Check kosher (may be hard)
  if ((filters as any).isKosher === true && !isHardConstraint('isKosher', hardConstraints)) {
    return true;
  }

  // Check gluten-free (always soft)
  if ((filters as any).isGlutenFree === true) {
    return true;
  }

  // Check rating (always soft)
  if (filters.minRatingBucket !== null) {
    return true;
  }

  return false;
}
