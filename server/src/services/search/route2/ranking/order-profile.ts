/**
 * Order Profile Resolver
 * 
 * Computes a deterministic ranking profile from intent/context WITHOUT using LLM.
 * 
 * CRITICAL RULES:
 * - NO LLM - purely deterministic
 * - Language MUST NOT affect orderProfile
 * - Based only on intent signals (openNow, price, quality)
 */

export type OrderProfile = 'balanced' | 'nearby' | 'quality' | 'budget';

/**
 * Weight configuration for each order profile
 * 
 * Weights are normalized percentages that sum to 100
 */
export interface OrderWeights {
  rating: number;      // 0-100
  reviews: number;     // 0-100
  price: number;       // 0-100 (lower price = better for budget)
  openNow: number;     // 0-100
  distance: number;    // 0-100
}

/**
 * Order metadata returned in search response
 */
export interface OrderMetadata {
  profile: OrderProfile;
  weights: OrderWeights;
}

/**
 * Context for resolving order profile
 */
export interface OrderProfileContext {
  intentText?: string;           // Canonical/normalized query text (NOT used for profile, only for logging)
  hasUserLocation: boolean;      // Whether user location is available
  openNowRequested?: boolean;    // Explicit "open now" intent
  priceIntent?: 'cheap' | 'mid' | 'premium';  // Price preference from intent
  qualityIntent?: boolean;       // Quality signals: "recommended", "best", "romantic", etc.
}

/**
 * Weight configurations for each profile
 * 
 * Each profile represents a different ranking strategy:
 * - balanced: Equal consideration of all factors
 * - nearby: Prioritize proximity, useful when location matters
 * - quality: Prioritize rating and reviews
 * - budget: Prioritize lower prices
 */
const PROFILE_WEIGHTS: Record<OrderProfile, OrderWeights> = {
  balanced: {
    rating: 25,
    reviews: 20,
    price: 15,
    openNow: 15,
    distance: 25
  },
  nearby: {
    rating: 15,
    reviews: 10,
    price: 10,
    openNow: 25,
    distance: 40
  },
  quality: {
    rating: 35,
    reviews: 30,
    price: 10,
    openNow: 10,
    distance: 15
  },
  budget: {
    rating: 15,
    reviews: 15,
    price: 35,
    openNow: 15,
    distance: 20
  }
};

/**
 * Resolve order profile from intent/context
 * 
 * DETERMINISTIC PRIORITY RULES:
 * 1. If openNowRequested === true → nearby
 * 2. Else if priceIntent === 'cheap' → budget
 * 3. Else if qualityIntent === true → quality
 * 4. Else → balanced (default)
 * 
 * LANGUAGE-INDEPENDENT: Does NOT consider query language
 * 
 * @param ctx Context with intent signals
 * @returns OrderProfile enum value
 */
export function resolveOrderProfile(ctx: OrderProfileContext): OrderProfile {
  // Rule 1: Open now intent → prioritize proximity and availability
  if (ctx.openNowRequested === true) {
    return 'nearby';
  }

  // Rule 2: Cheap/budget intent → prioritize lower prices
  if (ctx.priceIntent === 'cheap') {
    return 'budget';
  }

  // Rule 3: Quality intent → prioritize rating and reviews
  if (ctx.qualityIntent === true) {
    return 'quality';
  }

  // Rule 4: Default → balanced ranking
  return 'balanced';
}

/**
 * Get weights for a given order profile
 * 
 * @param profile Order profile enum
 * @returns Weight configuration
 */
export function getOrderWeights(profile: OrderProfile): OrderWeights {
  return PROFILE_WEIGHTS[profile];
}

/**
 * Resolve full order metadata (profile + weights)
 * 
 * Convenience function that combines profile resolution and weight lookup
 * 
 * @param ctx Context with intent signals
 * @returns Complete order metadata
 */
export function resolveOrderMetadata(ctx: OrderProfileContext): OrderMetadata {
  const profile = resolveOrderProfile(ctx);
  const weights = getOrderWeights(profile);

  return {
    profile,
    weights
  };
}

/**
 * Validate that weights sum to 100
 * 
 * @param weights Weight configuration
 * @returns true if valid, false otherwise
 */
export function validateWeights(weights: OrderWeights): boolean {
  const sum = weights.rating + weights.reviews + weights.price + weights.openNow + weights.distance;
  return sum === 100;
}

// Validate all profile weights at module load
for (const [profile, weights] of Object.entries(PROFILE_WEIGHTS)) {
  if (!validateWeights(weights)) {
    throw new Error(`[ORDER_PROFILE] Invalid weights for profile '${profile}': weights must sum to 100`);
  }
}
