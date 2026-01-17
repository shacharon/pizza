/**
 * Post-Results Filter - Route2 Pipeline
 * 
 * Deterministic filtering applied after Google API results are received
 * Filters: openState (ANY, OPEN_NOW, CLOSED_NOW)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { FinalSharedFilters, OpenState } from '../shared/shared-filters.types.js';

export interface PostFilterInput {
  results: any[];  // PlaceResult[] from Google Maps stage
  sharedFilters: FinalSharedFilters;
  requestId: string;
  pipelineVersion: 'route2';
}

export interface PostFilterOutput {
  resultsFiltered: any[];
  applied: {
    openState: OpenState;
  };
  stats: {
    before: number;
    after: number;
  };
}

/**
 * Apply post-result filters to search results
 * 
 * @param input Results and filters to apply
 * @returns Filtered results with metadata
 */
export function applyPostFilters(input: PostFilterInput): PostFilterOutput {
  const { results, sharedFilters, requestId, pipelineVersion } = input;
  
  const beforeCount = results.length;
  let filteredResults = results;

  // Filter by openState
  filteredResults = filterByOpenState(filteredResults, sharedFilters.openState);

  const afterCount = filteredResults.length;

  // Log filter application
  logger.info({
    requestId,
    pipelineVersion,
    event: 'post_filter_applied',
    openState: sharedFilters.openState,
    stats: {
      before: beforeCount,
      after: afterCount,
      removed: beforeCount - afterCount
    }
  }, '[ROUTE2] Post-filters applied');

  return {
    resultsFiltered: filteredResults,
    applied: {
      openState: sharedFilters.openState
    },
    stats: {
      before: beforeCount,
      after: afterCount
    }
  };
}

/**
 * Filter results by open/closed state
 * 
 * Rules:
 * - ANY: no filtering (return all)
 * - OPEN_NOW: keep only places where currentOpeningHours?.openNow === true
 * - CLOSED_NOW: keep only places where currentOpeningHours?.openNow === false
 * - Missing currentOpeningHours: filter out for OPEN_NOW and CLOSED_NOW (defensive)
 * 
 * @param results Array of place results
 * @param openState Desired open state filter
 * @returns Filtered array
 */
function filterByOpenState(results: any[], openState: OpenState): any[] {
  if (openState === 'ANY') {
    return results;
  }

  if (openState === 'OPEN_NOW') {
    return results.filter(place => place.openNow === true);
  }

  if (openState === 'CLOSED_NOW') {
    return results.filter(place => place.openNow === false);
  }

  return results;
}
