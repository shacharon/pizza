/**
 * Hybrid Deterministic Order Weights Module
 * 
 * PHILOSOPHY:
 * - Base weights (balanced) + deterministic rule-based tweaks = final weights
 * - NO LLM for sorting - purely deterministic based on intent flags
 * - Language-independent - depends only on structured intent signals
 * - Multiple rules can apply simultaneously (e.g., romantic + open now + has location)
 * 
 * INVARIANTS:
 * - All weights in [5..50] range (prevents domination by single factor)
 * - Final weights sum exactly to 100 (proportional normalization)
 * - Same inputs → identical outputs (deterministic)
 * - Reason codes explain which rules were applied
 */

export type WeightKey = 'rating' | 'reviews' | 'price' | 'openNow' | 'distance';

/**
 * Weight configuration (0-100 scale, must sum to 100)
 */
export interface OrderWeights {
  rating: number;      // 0-100
  reviews: number;     // 0-100
  price: number;       // 0-100
  openNow: number;     // 0-100
  distance: number;    // 0-100
}

/**
 * Context for hybrid weight resolution
 * All fields are structured intent signals (not raw query text)
 */
export interface HybridWeightContext {
  /** Route method from intent stage */
  method: 'nearby' | 'textsearch' | 'landmark';

  /** Whether user location is available (GPS/IP) */
  hasUserLocation: boolean;

  /** Proximity/distance intent detected */
  distanceIntent: boolean;

  /** Explicit "open now" filter requested */
  openNowRequested: boolean;

  /** Price preference from intent */
  priceIntent: 'cheap' | 'any';

  /** Quality/special occasion intent (romantic, best, recommended) */
  qualityIntent: boolean;

  /** Specific occasion type (if detected) */
  occasion?: 'romantic' | null;

  /** Cuisine key (if detected) */
  cuisineKey?: string | null;

  /** For logging only */
  requestId?: string;
}

/**
 * Hybrid order metadata returned to client
 */
export interface HybridOrderMetadata {
  /** Base profile used (always "balanced" for hybrid system) */
  base: 'balanced';

  /** Final computed weights (sum = 100) */
  weights: OrderWeights;

  /** Reason codes explaining which rules were applied */
  reasonCodes: string[];

  /** Snapshot of input context (for debugging) */
  inputsSnapshot: {
    method: string;
    hasUserLocation: boolean;
    distanceIntent: boolean;
    openNowRequested: boolean;
    priceIntent: string;
    qualityIntent: boolean;
    occasion?: string | null;
    cuisineKey?: string | null;
  };
}

/**
 * Base weights (balanced)
 * INVARIANT: Must sum to exactly 100
 */
const BASE_WEIGHTS: OrderWeights = {
  rating: 25,
  reviews: 20,
  price: 15,
  openNow: 15,
  distance: 25
};

/**
 * Weight constraints
 */
const MIN_WEIGHT = 5;   // Minimum weight (prevents zero weight)
const MAX_WEIGHT = 50;  // Maximum weight (prevents single factor domination)

/**
 * Apply RULE A: Distance/Proximity Intent
 * Triggered when: distanceIntent OR method=nearby OR hasUserLocation
 * Effect: Boost distance and openNow, reduce rating/reviews/price
 */
function applyDistanceRule(
  weights: OrderWeights,
  ctx: HybridWeightContext,
  reasonCodes: string[]
): void {
  if (ctx.distanceIntent || ctx.method === 'nearby' || ctx.hasUserLocation) {
    weights.distance += 15;
    weights.openNow += 5;
    weights.rating -= 10;
    weights.reviews -= 5;
    weights.price -= 5;

    reasonCodes.push('RULE_A_DISTANCE');
  }
}

/**
 * Apply RULE B: Open Now Intent
 * Triggered when: openNowRequested
 * Effect: Boost openNow and distance, reduce rating/reviews/price
 */
function applyOpenNowRule(
  weights: OrderWeights,
  ctx: HybridWeightContext,
  reasonCodes: string[]
): void {
  if (ctx.openNowRequested) {
    weights.openNow += 15;
    weights.distance += 5;
    weights.rating -= 10;
    weights.reviews -= 5;
    weights.price -= 5;

    reasonCodes.push('RULE_B_OPEN_NOW');
  }
}

/**
 * Apply RULE C: Budget/Price Intent
 * Triggered when: priceIntent='cheap'
 * Effect: Boost price and distance, reduce rating/reviews/openNow
 */
function applyBudgetRule(
  weights: OrderWeights,
  ctx: HybridWeightContext,
  reasonCodes: string[]
): void {
  if (ctx.priceIntent === 'cheap') {
    weights.price += 20;
    weights.distance += 5;
    weights.rating -= 10;
    weights.reviews -= 5;
    weights.openNow -= 10;

    reasonCodes.push('RULE_C_BUDGET');
  }
}

/**
 * Apply RULE D: Quality/Occasion Intent
 * Triggered when: qualityIntent OR occasion='romantic'
 * Effect: Boost rating and reviews, reduce distance/price/openNow
 */
function applyQualityRule(
  weights: OrderWeights,
  ctx: HybridWeightContext,
  reasonCodes: string[]
): void {
  if (ctx.qualityIntent || ctx.occasion === 'romantic') {
    weights.rating += 15;
    weights.reviews += 15;
    weights.distance -= 15;
    weights.price -= 10;
    weights.openNow -= 5;

    reasonCodes.push('RULE_D_QUALITY');
  }
}

/**
 * Clamp weight to valid range [MIN_WEIGHT, MAX_WEIGHT]
 * Tracks how many weights hit boundaries
 */
function clampWeight(weight: number): { value: number; hitMin: boolean; hitMax: boolean } {
  if (weight < MIN_WEIGHT) {
    return { value: MIN_WEIGHT, hitMin: true, hitMax: false };
  }
  if (weight > MAX_WEIGHT) {
    return { value: MAX_WEIGHT, hitMin: false, hitMax: true };
  }
  return { value: weight, hitMin: false, hitMax: false };
}

/**
 * Clamp all weights to [MIN_WEIGHT, MAX_WEIGHT]
 * Returns clamped weights and statistics
 */
function clampWeights(weights: OrderWeights): {
  weights: OrderWeights;
  clampHits: { key: WeightKey; hitMin: boolean; hitMax: boolean }[];
} {
  const clampHits: { key: WeightKey; hitMin: boolean; hitMax: boolean }[] = [];
  const clampedWeights: OrderWeights = { ...weights };

  for (const key of ['rating', 'reviews', 'price', 'openNow', 'distance'] as WeightKey[]) {
    const result = clampWeight(weights[key]);
    clampedWeights[key] = result.value;

    if (result.hitMin || result.hitMax) {
      clampHits.push({ key, hitMin: result.hitMin, hitMax: result.hitMax });
    }
  }

  return { weights: clampedWeights, clampHits };
}

/**
 * Normalize weights to sum exactly to 100
 * Uses proportional scaling + rounding adjustment
 */
function normalizeWeights(weights: OrderWeights): OrderWeights {
  // Calculate current sum
  const sum = weights.rating + weights.reviews + weights.price +
    weights.openNow + weights.distance;

  if (sum === 100) {
    // Already normalized
    return weights;
  }

  // Proportional scaling
  const scale = 100 / sum;
  const scaled: OrderWeights = {
    rating: weights.rating * scale,
    reviews: weights.reviews * scale,
    price: weights.price * scale,
    openNow: weights.openNow * scale,
    distance: weights.distance * scale
  };

  // Round to integers
  const rounded: OrderWeights = {
    rating: Math.round(scaled.rating),
    reviews: Math.round(scaled.reviews),
    price: Math.round(scaled.price),
    openNow: Math.round(scaled.openNow),
    distance: Math.round(scaled.distance)
  };

  // Adjust for rounding error (distribute remainder to largest weight)
  const roundedSum = rounded.rating + rounded.reviews + rounded.price +
    rounded.openNow + rounded.distance;
  const diff = 100 - roundedSum;

  if (diff !== 0) {
    // Find largest weight and adjust
    const keys: WeightKey[] = ['rating', 'reviews', 'price', 'openNow', 'distance'];
    const maxKey = keys.reduce((max, key) =>
      rounded[key] > rounded[max] ? key : max
    );
    rounded[maxKey] += diff;
  }

  return rounded;
}

/**
 * Resolve hybrid order weights from context
 * 
 * ALGORITHM:
 * 1. Start with BASE_WEIGHTS (balanced)
 * 2. Apply deterministic tweak rules in priority order (accumulate deltas)
 * 3. Clamp each weight to [MIN_WEIGHT, MAX_WEIGHT]
 * 4. Normalize to sum = 100 (proportional scaling)
 * 5. Return metadata with weights + reasonCodes
 * 
 * INVARIANTS:
 * - Same inputs → identical outputs (deterministic)
 * - Final weights always sum to 100
 * - Each weight in [5, 50] range
 * - Language-independent (depends only on intent flags)
 */
export function resolveHybridOrderWeights(
  ctx: HybridWeightContext
): HybridOrderMetadata {
  // Step 1: Start with base weights (copy to avoid mutation)
  const weights: OrderWeights = { ...BASE_WEIGHTS };
  const reasonCodes: string[] = ['BASE_BALANCED'];

  // Step 2: Apply deterministic tweak rules (in priority order)
  applyDistanceRule(weights, ctx, reasonCodes);
  applyOpenNowRule(weights, ctx, reasonCodes);
  applyBudgetRule(weights, ctx, reasonCodes);
  applyQualityRule(weights, ctx, reasonCodes);

  // Step 3: Clamp weights to [MIN_WEIGHT, MAX_WEIGHT]
  const { weights: clampedWeights, clampHits } = clampWeights(weights);

  // Step 4: Normalize to sum = 100
  const normalizedWeights = normalizeWeights(clampedWeights);

  // Step 5: Build metadata
  const metadata: HybridOrderMetadata = {
    base: 'balanced',
    weights: normalizedWeights,
    reasonCodes,
    inputsSnapshot: {
      method: ctx.method,
      hasUserLocation: ctx.hasUserLocation,
      distanceIntent: ctx.distanceIntent,
      openNowRequested: ctx.openNowRequested,
      priceIntent: ctx.priceIntent,
      qualityIntent: ctx.qualityIntent,
      occasion: ctx.occasion ?? null,
      cuisineKey: ctx.cuisineKey ?? null
    }
  };

  // Validation: Ensure sum = 100
  const finalSum = normalizedWeights.rating + normalizedWeights.reviews +
    normalizedWeights.price + normalizedWeights.openNow +
    normalizedWeights.distance;

  if (finalSum !== 100) {
    throw new Error(`[HYBRID_WEIGHTS] Normalization failed: sum=${finalSum}, expected 100`);
  }

  // Validation: Ensure all weights in [MIN_WEIGHT, MAX_WEIGHT]
  for (const key of ['rating', 'reviews', 'price', 'openNow', 'distance'] as WeightKey[]) {
    const weight = normalizedWeights[key];
    if (weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      throw new Error(
        `[HYBRID_WEIGHTS] Weight out of bounds: ${key}=${weight}, expected [${MIN_WEIGHT}, ${MAX_WEIGHT}]`
      );
    }
  }

  return metadata;
}

/**
 * Get base weights (for testing)
 */
export function getBaseWeights(): OrderWeights {
  return { ...BASE_WEIGHTS };
}

/**
 * Get weight constraints (for testing)
 */
export function getWeightConstraints() {
  return { MIN_WEIGHT, MAX_WEIGHT };
}
