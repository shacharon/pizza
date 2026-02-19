/**
 * Decide whether to keep a result based on result.priceLevel vs requested priceLevelRange.
 * Returns JSON only: { keep, reason }.
 */

import type { PriceLevel, PriceLevelRange, PriceLevelKeepResult } from './price-constraints.types.js';

/**
 * Given result.priceLevel (1–4 | null) and requested.priceLevelRange,
 * return { keep: true|false, reason: string }.
 *
 * - No requested range → keep true
 * - result.priceLevel null → keep true (unknown)
 * - priceLevel within [min, max] → keep true
 * - else → keep false
 */
export function shouldKeepByPriceLevel(
  resultPriceLevel: PriceLevel | null,
  requestedPriceLevelRange: PriceLevelRange | null | undefined
): PriceLevelKeepResult {
  if (requestedPriceLevelRange == null) {
    return { keep: true, reason: 'no_price_range_requested' };
  }
  if (resultPriceLevel == null) {
    return { keep: true, reason: 'result_price_unknown' };
  }
  const { min, max } = requestedPriceLevelRange;
  if (resultPriceLevel >= min && resultPriceLevel <= max) {
    return { keep: true, reason: 'within_range' };
  }
  return {
    keep: false,
    reason: `price_level_${resultPriceLevel}_outside_range_${min}_${max}`,
  };
}
