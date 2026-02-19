/**
 * Orchestrator Filters Module
 * Handles filter resolution and post-filter application
 */

import type { Route2Context, IntentResult } from './types.js';
import type { PreGoogleBaseFilters, FinalSharedFilters } from './shared/shared-filters.types.js';
import type { PostConstraints } from './shared/post-constraints.types.js';
import { resolveFilters } from './shared/filters-resolver.js';
import { applyPostFilters } from './post-filters/post-results.filter.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { startStage, endStage } from '../../../lib/telemetry/stage-timer.js';

/**
 * Resolve final filters from base filters and intent
 */
export async function resolveAndStoreFilters(
  baseFilters: PreGoogleBaseFilters,
  intentDecision: IntentResult,
  ctx: Route2Context
): Promise<FinalSharedFilters> {
  const { requestId } = ctx;

  logger.info({ requestId, pipelineVersion: 'route2', event: 'await_base_filters' }, '[ROUTE2] Awaiting base filters');

  const finalFilters = await resolveFilters({
    base: baseFilters,
    intent: intentDecision,
    deviceRegionCode: ctx.userRegionCode ?? null,
    userLocation: ctx.userLocation ?? null,
    requestId: ctx.requestId
  });

  // DUPLICATE LOG FIX: Removed - already logged in filters-resolver.ts (richer version)
  // The filters-resolver logs with sanitized=true and more complete context

  ctx.sharedFilters = { preGoogle: baseFilters, final: finalFilters };

  return finalFilters;
}

/**
 * Apply post-filters to Google results
 * Merges post-constraints with final filters and applies filtering
 */
export function applyPostFiltersToResults(
  googleResults: any[],
  postConstraints: PostConstraints,
  finalFilters: FinalSharedFilters,
  ctx: Route2Context
): {
  resultsFiltered: any[];
  stats: any;
} {
  const { requestId } = ctx;

  // Log awaiting post constraints
  logger.info(
    { requestId, pipelineVersion: 'route2', event: 'await_post_constraints' },
    '[ROUTE2] Awaiting post constraints (late)'
  );

  // Start post_filter stage
  const postFilterStart = startStage(ctx, 'post_filter', {
    openState: postConstraints.openState,
    priceLevel: postConstraints.priceLevel,
    isKosher: postConstraints.isKosher,
    isGlutenFree: postConstraints.isGlutenFree
  });

  // Merge post-constraints with final filters
  const filtersForPostFilter = {
    ...finalFilters,
    openState: postConstraints.openState ?? finalFilters.openState,
    openAt: postConstraints.openAt
      ? { day: postConstraints.openAt.day, timeHHmm: postConstraints.openAt.timeHHmm, timezone: null }
      : finalFilters.openAt,
    openBetween: postConstraints.openBetween
      ? {
        day: postConstraints.openBetween.day,
        startHHmm: postConstraints.openBetween.startHHmm,
        endHHmm: postConstraints.openBetween.endHHmm,
        timezone: null
      }
      : finalFilters.openBetween,
    priceLevel: postConstraints.priceLevel ?? (finalFilters as any).priceLevel,
    isKosher: postConstraints.isKosher ?? (finalFilters as any).isKosher,
    isGlutenFree: postConstraints.isGlutenFree ?? (finalFilters as any).isGlutenFree,
    requirements: postConstraints.requirements ?? (finalFilters as any).requirements
  };

  // Apply post-filters
  const postFilterResult = applyPostFilters({
    results: googleResults,
    sharedFilters: filtersForPostFilter as any,
    requestId: ctx.requestId,
    pipelineVersion: 'route2'
  });

  // End post_filter stage
  endStage(ctx, 'post_filter', postFilterStart, {
    stats: postFilterResult.stats,
    usedPostConstraints:
      postConstraints.openState !== null ||
      postConstraints.openAt !== null ||
      postConstraints.openBetween !== null ||
      postConstraints.priceLevel !== null ||
      postConstraints.isKosher !== null ||
      postConstraints.isGlutenFree !== null ||
      postConstraints.requirements?.accessible !== null ||
      postConstraints.requirements?.parking !== null
  });

  return postFilterResult;
}

/**
 * Build applied filters array for metadata
 */
export function buildAppliedFiltersArray(filtersForPostFilter: any): string[] {
  const appliedFiltersArray: string[] = [];
  if (filtersForPostFilter.openState) appliedFiltersArray.push(filtersForPostFilter.openState);
  if (filtersForPostFilter.priceLevel) appliedFiltersArray.push(`price:${filtersForPostFilter.priceLevel}`);
  if (filtersForPostFilter.isKosher) appliedFiltersArray.push('kosher');
  if (filtersForPostFilter.isGlutenFree) appliedFiltersArray.push('gluten-free:soft');
  return appliedFiltersArray;
}
