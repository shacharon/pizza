/**
 * TenBis (10bis) Enrichment - Provider-specific wrapper
 * 
 * Convenience wrapper for TenBis enrichment using the generic provider system.
 * Maintains backward compatibility with existing API.
 */

import type { RestaurantResult } from '../../../types/restaurant.types.js';
import type { Route2Context } from '../../types.js';
import { enrichWithProviderLinks } from './provider-enrichment.service.js';

/**
 * Enrich restaurant results with TenBis links (backward compatible API)
 * 
 * @param results Restaurant results to enrich
 * @param requestId Request ID for logging and WS events
 * @param cityText Optional city context from intent stage
 * @param ctx Route2 context
 * @returns Enriched results
 */
export async function enrichWithTenbisLinks(
  results: RestaurantResult[],
  requestId: string,
  cityText: string | null,
  ctx: Route2Context
): Promise<RestaurantResult[]> {
  return enrichWithProviderLinks('tenbis', results, requestId, cityText, ctx);
}
