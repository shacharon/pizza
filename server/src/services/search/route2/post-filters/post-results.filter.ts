/**
 * Post-Results Filter - Route2 Pipeline
 * 
 * Deterministic filtering applied after Google API results are received
 * Filters: openState (OPEN_NOW, CLOSED_NOW, null), priceIntent (CHEAP, MID, EXPENSIVE, null), minRatingBucket (R35, R40, R45, null)
 * Hints: dietary preferences (SOFT hints, no removal)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { FinalSharedFilters, OpenState, PriceIntent, MinRatingBucket } from '../shared/shared-filters.types.js';
import { attachDietaryHints } from './dietary-hints.js';
import { matchesPriceIntent } from './price/price-matrix.js';
import { meetsMinRating } from './rating/rating-matrix.js';
import { evaluateOpenAt, evaluateOpenBetween } from './opening-hours-evaluator.js';

export interface PostFilterInput {
  results: any[]; // PlaceResult[] from Google Maps stage
  sharedFilters: FinalSharedFilters;
  requestId: string;
  pipelineVersion: 'route2';
}

export interface PostFilterOutput {
  resultsFiltered: any[];
  applied: {
    openState: OpenState;
    priceIntent: PriceIntent;
    minRatingBucket: MinRatingBucket;
  };
  stats: {
    before: number;
    after: number;
    removed: number;
    unknownKept: number;
    unknownRemoved: number;
  };
  relaxed?: {
    priceIntent?: boolean;
    minRating?: boolean;
  };
}

/**
 * Apply post-result filters to search results
 */
export function applyPostFilters(input: PostFilterInput): PostFilterOutput {
  const { results, sharedFilters, requestId, pipelineVersion } = input;

  const beforeCount = results.length;
  let relaxed: { priceIntent?: boolean; minRating?: boolean } = {};

  // Step 1: Apply open/closed filter ONLY if explicitly requested
  const { filtered: openFiltered, unknownKept, unknownRemoved } = filterByOpenState(
    results,
    sharedFilters.openState,
    sharedFilters.openAt,
    sharedFilters.openBetween
  );

  // Step 2: Apply price filter ONLY if explicitly requested
  let currentFiltered = openFiltered;
  let priceIntentApplied = sharedFilters.priceIntent;

  if (sharedFilters.priceIntent !== null) {
    const priceFiltered = filterByPrice(currentFiltered, sharedFilters.priceIntent);
    
    // Auto-relax if filtering yields 0 results
    if (priceFiltered.length === 0 && currentFiltered.length > 0) {
      // Relax: return results without price filter
      relaxed.priceIntent = true;
      priceIntentApplied = null; // Mark as not applied due to relaxation
      
      logger.info({
        requestId,
        pipelineVersion,
        event: 'price_filter_relaxed',
        reason: 'zero_results',
        originalIntent: sharedFilters.priceIntent,
        beforeRelax: priceFiltered.length,
        afterRelax: currentFiltered.length
      }, '[ROUTE2] Price filter relaxed (0 results)');
    } else {
      currentFiltered = priceFiltered;
    }
  }

  // Step 3: Apply rating filter ONLY if explicitly requested
  let finalFiltered = currentFiltered;
  let minRatingBucketApplied = sharedFilters.minRatingBucket;

  if (sharedFilters.minRatingBucket !== null) {
    const ratingFiltered = filterByRating(currentFiltered, sharedFilters.minRatingBucket);
    
    // Auto-relax if filtering yields 0 results
    if (ratingFiltered.length === 0 && currentFiltered.length > 0) {
      // Relax: return results without rating filter
      finalFiltered = currentFiltered;
      relaxed.minRating = true;
      minRatingBucketApplied = null; // Mark as not applied due to relaxation
      
      logger.info({
        requestId,
        pipelineVersion,
        event: 'rating_filter_relaxed',
        reason: 'zero_results',
        originalBucket: sharedFilters.minRatingBucket,
        beforeRelax: ratingFiltered.length,
        afterRelax: currentFiltered.length
      }, '[ROUTE2] Rating filter relaxed (0 results)');
    } else {
      finalFiltered = ratingFiltered;
    }
  }

  // Step 4: Attach dietary hints (SOFT hints - no removal)
  const isGlutenFree = (sharedFilters as any).isGlutenFree ?? null;
  if (isGlutenFree === true) {
    for (const result of finalFiltered) {
      attachDietaryHints(result, isGlutenFree);
    }
  }

  const afterCount = finalFiltered.length;

  // Note: Timing/logging owned by orchestrator (startStage/endStage)
  // This function only returns data for orchestrator to log

  const output: PostFilterOutput = {
    resultsFiltered: finalFiltered,
    applied: {
      openState: sharedFilters.openState,
      priceIntent: priceIntentApplied,
      minRatingBucket: minRatingBucketApplied
    },
    stats: {
      before: beforeCount,
      after: afterCount,
      removed: beforeCount - afterCount,
      unknownKept,
      unknownRemoved
    }
  };

  // Only include relaxed field if we actually relaxed
  if (relaxed.priceIntent || relaxed.minRating) {
    output.relaxed = relaxed;
  }

  return output;
}

/**
 * Filter results by open/closed state
 *
 * Rules:
 * - null: no filtering
 * - OPEN_NOW: keep openNow === true, KEEP unknown (default policy)
 * - CLOSED_NOW: keep openNow === false, KEEP unknown (default policy)
 * - OPEN_AT / OPEN_BETWEEN: evaluate structured opening hours, KEEP unknown
 * - Unknown policy: KEEP by default (better UX than removing all results)
 */
function filterByOpenState(
  results: any[],
  openState: OpenState,
  openAt: any,
  openBetween: any
): { filtered: any[]; unknownKept: number; unknownRemoved: number } {
  if (openState == null) {
    return { filtered: results, unknownKept: 0, unknownRemoved: 0 };
  }

  let unknownKept = 0;
  let unknownRemoved = 0;

  if (openState === 'OPEN_NOW') {
    const filtered = results.filter(place => {
      const openNow = place.openNow ?? place.currentOpeningHours?.openNow;

      // Explicit status: apply filter
      if (openNow === true) {
        return true; // KEEP open places
      }
      if (openNow === false) {
        return false; // REMOVE closed places
      }

      // Unknown status: KEEP by default (better UX)
      if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
        unknownKept++;
        return true; // KEEP unknown
      }

      return false;
    });
    return { filtered, unknownKept, unknownRemoved };
  }

  if (openState === 'CLOSED_NOW') {
    const filtered = results.filter(place => {
      const openNow = place.openNow ?? place.currentOpeningHours?.openNow;

      // Explicit status: apply filter
      if (openNow === false) {
        return true; // KEEP closed places
      }
      if (openNow === true) {
        return false; // REMOVE open places
      }

      // Unknown status: KEEP by default
      if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
        unknownKept++;
        return true; // KEEP unknown
      }

      return false;
    });
    return { filtered, unknownKept, unknownRemoved };
  }

  if (openState === 'OPEN_AT' && openAt) {
    const filtered = results.filter(place => {
      const isOpen = evaluateOpenAt(place, openAt);

      // Explicit evaluation result
      if (isOpen === true) {
        return true;
      }
      if (isOpen === false) {
        return false;
      }

      // Unknown/unparseable: KEEP by default
      if (isOpen === null) {
        unknownKept++;
        return true; // KEEP unknown
      }

      return false;
    });
    return { filtered, unknownKept, unknownRemoved };
  }

  if (openState === 'OPEN_BETWEEN' && openBetween) {
    const filtered = results.filter(place => {
      const isOpen = evaluateOpenBetween(place, openBetween);

      // Explicit evaluation result
      if (isOpen === true) {
        return true;
      }
      if (isOpen === false) {
        return false;
      }

      // Unknown/unparseable: KEEP by default
      if (isOpen === null) {
        unknownKept++;
        return true; // KEEP unknown
      }

      return false;
    });
    return { filtered, unknownKept, unknownRemoved };
  }

  return { filtered: results, unknownKept: 0, unknownRemoved: 0 };
}

/**
 * Filter results by price intent
 * 
 * Rules:
 * - CHEAP: keep priceLevel=1 + unknowns
 * - MID: keep priceLevel=2 + unknowns
 * - EXPENSIVE: keep priceLevel=3,4 + unknowns
 * - Unknown policy: KEEP by default (better UX)
 */
function filterByPrice(results: any[], priceIntent: 'CHEAP' | 'MID' | 'EXPENSIVE'): any[] {
  return results.filter(place => {
    const priceLevel = place.priceLevel ?? place.price?.level;
    return matchesPriceIntent(priceLevel, priceIntent);
  });
}

/**
 * Filter results by minimum rating
 * 
 * Rules:
 * - R35: keep rating >= 3.5 + unknowns
 * - R40: keep rating >= 4.0 + unknowns
 * - R45: keep rating >= 4.5 + unknowns
 * - Unknown policy: KEEP by default (better UX)
 */
function filterByRating(results: any[], minRatingBucket: 'R35' | 'R40' | 'R45'): any[] {
  return results.filter(place => {
    const rating = place.rating;
    return meetsMinRating(rating, minRatingBucket);
  });
}
