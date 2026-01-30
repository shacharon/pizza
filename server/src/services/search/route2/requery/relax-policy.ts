/**
 * Relax Policy - Route2
 * 
 * Deterministic policy for relaxing soft filters when candidate pool yields too few results.
 * Applied ONLY when reusing candidate pool (not on Google requery).
 * 
 * Relaxation Order (most restrictive first):
 * 1. openState=OPEN_NOW → null (most common filter that removes results)
 * 2. dietary filters → null (kosher, gluten-free)
 * 3. minRatingBucket → null (relax rating requirement)
 * 
 * Note: Radius widening is NOT part of relax policy (requires Google requery).
 * Max 2 relaxation attempts to avoid over-relaxation.
 */

import type { FinalSharedFilters, OpenState, MinRatingBucket } from '../shared/shared-filters.types.js';

export interface RelaxStep {
  step: number;
  field: string;
  from: any;
  to: any;
  reason: string;
}

export interface RelaxResult {
  relaxed: boolean;
  nextFilters: FinalSharedFilters;
  steps: RelaxStep[];
}

/**
 * Relax filters if too few candidates remain after filtering
 * 
 * @param candidatesAfterFilter Number of candidates remaining after current filters
 * @param currentFilters Current filter configuration
 * @param attempt Current relaxation attempt (0-based)
 * @param minAcceptable Minimum acceptable number of candidates (default: 5)
 * @returns Relaxation result with updated filters
 */
export function relaxIfTooFew(
  candidatesAfterFilter: number,
  currentFilters: FinalSharedFilters,
  attempt: number = 0,
  minAcceptable: number = 5
): RelaxResult {
  const MAX_ATTEMPTS = 2;

  // No relaxation needed
  if (candidatesAfterFilter >= minAcceptable) {
    return {
      relaxed: false,
      nextFilters: currentFilters,
      steps: []
    };
  }

  // Max attempts reached
  if (attempt >= MAX_ATTEMPTS) {
    return {
      relaxed: false,
      nextFilters: currentFilters,
      steps: []
    };
  }

  const steps: RelaxStep[] = [];
  const nextFilters = { ...currentFilters };
  let relaxed = false;

  // Step 1: Relax openState=OPEN_NOW (most common restriction)
  if (currentFilters.openState === 'OPEN_NOW') {
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
  if (!relaxed && (currentFilters as any).isKosher === true) {
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
  else if (!relaxed && (currentFilters as any).isGlutenFree === true) {
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
    steps
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
 * @returns Final relaxed filters and candidates
 */
export function applyRelaxationCascade(
  candidatesPool: any[],
  currentFilters: FinalSharedFilters,
  filterFn: (pool: any[], filters: FinalSharedFilters) => any[],
  minAcceptable: number = 5
): {
  finalFilters: FinalSharedFilters;
  finalCandidates: any[];
  allSteps: RelaxStep[];
  attempts: number;
} {
  let filters = { ...currentFilters };
  let candidates = filterFn(candidatesPool, filters);
  let allSteps: RelaxStep[] = [];
  let attempts = 0;
  const MAX_ATTEMPTS = 2;

  while (candidates.length < minAcceptable && attempts < MAX_ATTEMPTS) {
    const relaxResult = relaxIfTooFew(candidates.length, filters, attempts, minAcceptable);

    if (!relaxResult.relaxed) {
      break; // No more relaxation possible
    }

    filters = relaxResult.nextFilters;
    allSteps.push(...relaxResult.steps);
    attempts++;

    // Re-apply filters with relaxed configuration
    candidates = filterFn(candidatesPool, filters);
  }

  return {
    finalFilters: filters,
    finalCandidates: candidates,
    allSteps,
    attempts
  };
}

/**
 * Check if filters can be relaxed further
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
