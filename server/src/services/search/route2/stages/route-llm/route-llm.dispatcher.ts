/**
 * Route-LLM Dispatcher - ROUTE2 Pipeline
 * 
 * Dispatches to route-specific LLM mappers based on Intent decision
 * Enforces compile-time exhaustiveness on route enum
 */

import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult, FinalSharedFilters } from '../../types.js';
import type { RouteLLMMapping } from './schemas.js';
import { executeTextSearchMapper } from './textsearch.mapper.js';
import { executeNearbyMapper } from './nearby.mapper.js';
import { executeLandmarkMapper } from './landmark.mapper.js';

/**
 * Execute Route-LLM stage
 * 
 * Dispatches to the appropriate mapper based on Intent route decision
 * 
 * @param intent Intent routing decision (regionCandidate only, NOT final region)
 * @param request Original search request
 * @param context Pipeline context
 * @param finalFilters Final filters from filters_resolved (SINGLE SOURCE OF TRUTH for region/language)
 * @returns Provider-ready mapping (discriminated union)
 * @throws Error if route is unknown (compile-time prevented by exhaustiveness check)
 */
export async function executeRouteLLM(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context,
  finalFilters: FinalSharedFilters
): Promise<RouteLLMMapping> {
  // Exhaustive switch on intent.route
  // TypeScript will error if a new route is added to MappingRoute but not handled here
  switch (intent.route) {
    case 'TEXTSEARCH':
      return executeTextSearchMapper(intent, request, context, finalFilters);

    case 'NEARBY':
      return executeNearbyMapper(intent, request, context, finalFilters);

    case 'LANDMARK':
      return executeLandmarkMapper(intent, request, context, finalFilters);

    default:
      // Exhaustiveness check: if this compiles, all routes are handled
      const _exhaustive: never = intent.route;
      throw new Error(`Unknown route: ${_exhaustive}`);
  }
}
