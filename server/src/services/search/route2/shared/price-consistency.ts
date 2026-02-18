/**
 * Check consistency of user constraints vs normalized priceLevelRange.
 * Returns JSON only: { consistent, issue }.
 */

import type {
  Budget,
  PriceIntent,
  PriceLevelRange,
  PriceConsistencyResult,
  Region,
} from './price-constraints.types.js';
import { toPriceLevelRange } from './price-level-range.mapper.js';

export interface ExtractedConstraints {
  priceIntent: PriceIntent;
  budget: Budget;
}

/**
 * Check consistency given user query, extracted constraints, and normalized priceLevelRange.
 * Flag false if: CHEAP→3–4, EXPENSIVE→1–2, budget contradicts priceIntent, or currency missing but budget assumed.
 */
export function checkPriceConsistency(
  _userQuery: string,
  extracted: ExtractedConstraints,
  normalizedPriceLevelRange: PriceLevelRange | null,
  options?: { region?: Region }
): PriceConsistencyResult {
  const { priceIntent, budget } = extracted;
  const range = normalizedPriceLevelRange;

  // Currency missing but budget assumed
  if (budget.amount != null && budget.amount > 0 && budget.currency == null) {
    return { consistent: false, issue: 'currency_missing_budget_assumed' };
  }

  // No range to contradict
  if (!range) {
    return { consistent: true, issue: null };
  }

  // CHEAP mapped to 3–4
  if (priceIntent === 'CHEAP' && range.min >= 3) {
    return { consistent: false, issue: 'cheap_mapped_to_3_4' };
  }

  // EXPENSIVE mapped to 1–2
  if (priceIntent === 'EXPENSIVE' && range.max <= 2) {
    return { consistent: false, issue: 'expensive_mapped_to_1_2' };
  }

  // Budget contradicts priceIntent (both present; need region to get budget range)
  if (priceIntent && budget.amount != null && budget.currency != null && options?.region) {
    const budgetOnly = toPriceLevelRange(null, budget, options.region).priceLevelRange;
    if (budgetOnly) {
      const intentRanges: Record<NonNullable<PriceIntent>, { min: number; max: number }> = {
        CHEAP: { min: 1, max: 2 },
        MID: { min: 2, max: 3 },
        EXPENSIVE: { min: 3, max: 4 },
      };
      const band = intentRanges[priceIntent];
      if (!band) {
        return { consistent: true, issue: null }; // Should never happen, but guard
      }
      const noOverlap = budgetOnly.max < band.min || budgetOnly.min > band.max;
      if (noOverlap) {
        return { consistent: false, issue: 'budget_contradicts_price_intent' };
      }
    }
  }

  return { consistent: true, issue: null };
}
