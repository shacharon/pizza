/**
 * Map priceIntent + budget + region → priceLevelRange (1–4).
 * Returns JSON only. Uses region price table; unsupported region → EU.
 */

import type { Budget, PriceIntent, PriceLevel, PriceLevelRange, PriceLevelRangeResult, Region } from './price-constraints.types.js';

const PRICE_LEVEL_MIN = 1;
const PRICE_LEVEL_MAX = 4;

/** Per-region upper bounds (exclusive) for levels 1..4 in local currency. Level N = (bounds[N-1], bounds[N]]. */
const REGION_BOUNDS: Record<Region, number[]> = {
  EU: [15, 30, 50, Infinity],   // EUR: 1=<15, 2=15-30, 3=30-50, 4=50+
  US: [15, 30, 50, Infinity],   // USD
  IL: [50, 100, 180, Infinity], // NIS
};

const REGION_CURRENCY: Record<Region, 'ILS' | 'USD' | 'EUR'> = {
  IL: 'ILS',
  US: 'USD',
  EU: 'EUR',
};

function clampLevel(n: number): PriceLevel {
  const v = Math.round(Number(n));
  if (v <= PRICE_LEVEL_MIN) return PRICE_LEVEL_MIN as PriceLevel;
  if (v >= PRICE_LEVEL_MAX) return PRICE_LEVEL_MAX as PriceLevel;
  return v as PriceLevel;
}

function intentToRange(priceIntent: PriceIntent): PriceLevelRange | null {
  if (!priceIntent) return null;
  switch (priceIntent) {
    case 'CHEAP':
      return { min: 1, max: 2 };
    case 'MID':
      return { min: 2, max: 3 };
    case 'EXPENSIVE':
      return { min: 3, max: 4 };
    default:
      return null;
  }
}

/** Amount in local currency → price level 1–4. */
function amountToLevel(amount: number, region: Region): PriceLevel {
  const bounds = REGION_BOUNDS[region];
  if (!bounds) return PRICE_LEVEL_MAX;
  
  for (let i = 0; i < bounds.length; i++) {
    if (amount <= bounds[i]!) return (i + 1) as PriceLevel;
  }
  return PRICE_LEVEL_MAX;
}

/** Budget (with amount + currency) to priceLevelRange; only when currency matches region. */
function budgetToRange(budget: Budget, region: Region): PriceLevelRange | null {
  const amount = budget.amount;
  if (amount == null || amount <= 0) return null;
  const regionCur = REGION_CURRENCY[region];
  if (!regionCur || budget.currency !== regionCur) return null;
  const level = amountToLevel(amount, region);
  const op = budget.op;
  if (op === 'MAX') {
    return { min: PRICE_LEVEL_MIN as PriceLevel, max: level };
  }
  if (op === 'EXACT') {
    return { min: level, max: level };
  }
  return { min: level, max: level };
}

function intersectRanges(a: PriceLevelRange, b: PriceLevelRange): PriceLevelRange | null {
  const min = Math.max(a.min, b.min) as PriceLevel;
  const max = Math.min(a.max, b.max) as PriceLevel;
  if (min > max) return null;
  return { min, max };
}

function normalizeRegion(region: string | undefined | null): Region {
  if (region === 'IL' || region === 'US' || region === 'EU') return region;
  return 'EU';
}

/**
 * Compute priceLevelRange from priceIntent, budget, and region.
 * - priceIntent: CHEAP→1–2, MID→2–3, EXPENSIVE→3–4.
 * - budget: mapped via region price table (only when currency matches region); unsupported region → EU.
 * - All values clamped to 1–4.
 */
export function toPriceLevelRange(
  priceIntent: PriceIntent,
  budget: Budget,
  region: Region | string | undefined | null
): PriceLevelRangeResult {
  const reg = normalizeRegion(region);
  const intentRange = intentToRange(priceIntent);
  const budgetRange = budgetToRange(budget, reg);

  let range: PriceLevelRange | null = null;
  if (intentRange && budgetRange) {
    range = intersectRanges(intentRange, budgetRange);
  } else if (intentRange) {
    range = intentRange;
  } else if (budgetRange) {
    range = budgetRange;
  }

  if (range) {
    range = {
      min: clampLevel(range.min),
      max: clampLevel(range.max),
    };
    if (range.min > range.max) range = { min: range.max, max: range.max };
  }

  return { priceLevelRange: range };
}
