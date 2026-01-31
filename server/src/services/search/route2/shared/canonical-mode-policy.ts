/**
 * Canonical Mode Policy - Deterministic Decision
 * 
 * Decides between KEYED and FREETEXT modes based on available location + category anchors.
 * NO LLM calls - pure deterministic logic.
 * 
 * Rules:
 * - KEYED: Has location anchor (city/address/nearMe) AND category key (cuisine/placeType/dietary)
 * - FREETEXT: Otherwise (missing either location or category)
 * - CLARIFY: nearMe intent but missing userLocation
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { IntentResult } from '../types.js';
import type { SearchRequest } from '../../types/search-request.dto.js';

export type CanonicalMode = 'KEYED' | 'FREETEXT' | 'CLARIFY';

export interface CanonicalModeDecision {
  mode: CanonicalMode;
  reason: string;
  locationAnchor: 'cityText' | 'addressText' | 'nearMe' | null;
  categoryKey: 'cuisineKey' | 'placeTypeKey' | 'dietaryKey' | null;
  cuisineKey: string | null;
  placeTypeKey: string | null;
  dietaryKey: string | null;
}

/**
 * Determine canonical mode based on available anchors
 * 
 * @param intent Intent stage result (contains cityText, cuisineKey)
 * @param request Search request (contains userLocation, filters.dietary)
 * @param llmCuisineKey Optional cuisine key from LLM (textsearch mapper)
 * @param llmPlaceTypeKey Optional place type from LLM
 * @returns Canonical mode decision with reasoning
 */
export function determineCanonicalMode(
  intent: IntentResult,
  request: SearchRequest,
  llmCuisineKey?: string | null,
  llmPlaceTypeKey?: string | null,
  requestId?: string
): CanonicalModeDecision {
  // Step 1: Check location anchors
  const hasCityText = !!intent.cityText;
  const hasUserLocation = !!request.userLocation;
  const isNearMeIntent = intent.route === 'NEARBY' || intent.distanceIntent;

  // Determine location anchor
  let locationAnchor: 'cityText' | 'addressText' | 'nearMe' | null = null;

  if (hasCityText) {
    locationAnchor = 'cityText';
  } else if (isNearMeIntent && hasUserLocation) {
    locationAnchor = 'nearMe';
  }
  // Note: addressText not implemented yet (future: intent could extract address)

  // Step 2: Check category keys
  const cuisineKey = llmCuisineKey || intent.cuisineKey || null;
  const placeTypeKey = llmPlaceTypeKey || null;
  const dietaryKey = request.filters?.dietary?.[0] || null; // Take first dietary filter if any

  // Determine category anchor
  let categoryKey: 'cuisineKey' | 'placeTypeKey' | 'dietaryKey' | null = null;

  if (cuisineKey) {
    categoryKey = 'cuisineKey';
  } else if (placeTypeKey) {
    categoryKey = 'placeTypeKey';
  } else if (dietaryKey) {
    categoryKey = 'dietaryKey';
  }

  // Step 3: Apply policy rules

  // Rule 1: CLARIFY if nearMe intent but missing userLocation
  if (isNearMeIntent && !hasUserLocation) {
    const decision: CanonicalModeDecision = {
      mode: 'CLARIFY',
      reason: 'nearMe_intent_missing_location',
      locationAnchor: null,
      categoryKey,
      cuisineKey,
      placeTypeKey,
      dietaryKey
    };

    logger.info({
      requestId,
      stage: 'canonical_mode_policy',
      event: 'canonical_decision',
      mode: decision.mode,
      reason: decision.reason,
      locationAnchor: decision.locationAnchor,
      categoryKey: decision.categoryKey,
      cuisineKey,
      placeTypeKey,
      dietaryKey,
      isNearMeIntent,
      hasUserLocation
    }, '[CANONICAL] Mode decision: CLARIFY (nearMe without location)');

    return decision;
  }

  // Rule 2: KEYED if both location AND category anchors exist
  if (locationAnchor && categoryKey) {
    const decision: CanonicalModeDecision = {
      mode: 'KEYED',
      reason: `has_${locationAnchor}_and_${categoryKey}`,
      locationAnchor,
      categoryKey,
      cuisineKey,
      placeTypeKey,
      dietaryKey
    };

    logger.info({
      requestId,
      stage: 'canonical_mode_policy',
      event: 'canonical_decision',
      mode: decision.mode,
      reason: decision.reason,
      locationAnchor: decision.locationAnchor,
      categoryKey: decision.categoryKey,
      cuisineKey,
      placeTypeKey,
      dietaryKey,
      hasCityText,
      hasUserLocation,
      isNearMeIntent
    }, '[CANONICAL] Mode decision: KEYED (location + category)');

    return decision;
  }

  // Rule 3: FREETEXT (missing either location or category)
  const missingAnchor = !locationAnchor ? 'location' : 'category';
  const decision: CanonicalModeDecision = {
    mode: 'FREETEXT',
    reason: `missing_${missingAnchor}_anchor`,
    locationAnchor,
    categoryKey,
    cuisineKey,
    placeTypeKey,
    dietaryKey
  };

  logger.info({
    requestId,
    stage: 'canonical_mode_policy',
    event: 'canonical_decision',
    mode: decision.mode,
    reason: decision.reason,
    locationAnchor: decision.locationAnchor,
    categoryKey: decision.categoryKey,
    cuisineKey,
    placeTypeKey,
    dietaryKey,
    missingAnchor,
    hasCityText,
    hasUserLocation,
    isNearMeIntent
  }, '[CANONICAL] Mode decision: FREETEXT (missing anchor)');

  return decision;
}
