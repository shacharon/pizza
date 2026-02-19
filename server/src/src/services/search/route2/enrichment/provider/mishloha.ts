/**
 * Mishloha Enrichment - Provider-specific wrapper
 * 
 * Convenience wrapper for Mishloha enrichment using the generic provider system.
 */

import type { RestaurantResult } from '../../../types/restaurant.types.js';
import type { Route2Context } from '../../types.js';
import { enrichWithProviderLinks } from './provider-enrichment.service.js';

/**
 * Enrich restaurant results with Mishloha links
 * 
 * @param results Restaurant results to enrich
 * @param requestId Request ID for logging and WS events
 * @param cityText Optional city context from intent stage
 * @param ctx Route2 context
 * @returns Enriched results
 */
export async function enrichWithMishlohaLinks(
  results: RestaurantResult[],
  requestId: string,
  cityText: string | null,
  ctx: Route2Context
): Promise<RestaurantResult[]> {
  return enrichWithProviderLinks('mishloha', results, requestId, cityText, ctx);
}
