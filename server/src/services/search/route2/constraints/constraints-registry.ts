/**
 * Central constraints registry — single source of truth for restaurant search filters.
 * Used for response metadata (enforcement + source per filter). No filtering logic here.
 */

import type { ConstraintDefinition, ConstraintKey } from './constraints-registry.types.js';

export const CONSTRAINTS_REGISTRY: Record<ConstraintKey, ConstraintDefinition> = {
  kosher: {
    key: 'kosher',
    source: 'post_constraints_llm',
    enforcement: 'hard',
    applyStage: 'post_filter',
    uiLabel: 'Kosher',
    unknownPolicy: 'exclude',
  },
  accessible: {
    key: 'accessible',
    source: 'post_constraints_llm',
    enforcement: 'not_applied',
    applyStage: 'not_applied',
    uiLabel: 'Accessible',
    unknownPolicy: 'not_applied',
  },
  parking: {
    key: 'parking',
    source: 'post_constraints_llm',
    enforcement: 'not_applied',
    applyStage: 'not_applied',
    uiLabel: 'Parking',
    unknownPolicy: 'not_applied',
  },
  openState: {
    key: 'openState',
    source: 'base_filters_llm',
    enforcement: 'hard',
    applyStage: 'post_filter',
    uiLabel: 'Open now',
    unknownPolicy: 'exclude',
  },
  priceRange: {
    key: 'priceRange',
    source: 'post_constraints_llm',
    enforcement: 'soft',
    applyStage: 'post_filter',
    uiLabel: 'Price range',
    unknownPolicy: 'include',
  },
  priceIntent: {
    key: 'priceIntent',
    source: 'base_filters_llm',
    enforcement: 'soft',
    applyStage: 'post_filter',
    uiLabel: 'Price intent',
    unknownPolicy: 'include',
  },
  glutenFree: {
    key: 'glutenFree',
    source: 'post_constraints_llm',
    enforcement: 'hint',
    applyStage: 'ranking_only',
    uiLabel: 'Gluten free',
    unknownPolicy: 'include',
  },
  veganFriendly: {
    key: 'veganFriendly',
    source: 'not_extracted',
    enforcement: 'not_applied',
    applyStage: 'not_applied',
    uiLabel: 'Vegan friendly',
    unknownPolicy: 'not_applied',
  },
  vegetarianFriendly: {
    key: 'vegetarianFriendly',
    source: 'not_extracted',
    enforcement: 'not_applied',
    applyStage: 'not_applied',
    uiLabel: 'Vegetarian friendly',
    unknownPolicy: 'not_applied',
  },
  vibeRomantic: {
    key: 'vibeRomantic',
    source: 'not_extracted',
    enforcement: 'not_applied',
    applyStage: 'not_applied',
    uiLabel: 'Romantic',
    unknownPolicy: 'not_applied',
  },
  vibeQuiet: {
    key: 'vibeQuiet',
    source: 'not_extracted',
    enforcement: 'not_applied',
    applyStage: 'not_applied',
    uiLabel: 'Quiet',
    unknownPolicy: 'not_applied',
  },
  vibeFamily: {
    key: 'vibeFamily',
    source: 'not_extracted',
    enforcement: 'not_applied',
    applyStage: 'not_applied',
    uiLabel: 'Family friendly',
    unknownPolicy: 'not_applied',
  },
  vibeLaptop: {
    key: 'vibeLaptop',
    source: 'not_extracted',
    enforcement: 'not_applied',
    applyStage: 'not_applied',
    uiLabel: 'Laptop friendly',
    unknownPolicy: 'not_applied',
  },
};

/** All constraint keys in registry order (for stable ordering in metadata). */
export const CONSTRAINT_KEYS_ORDER: ConstraintKey[] = [
  'openState',
  'priceRange',
  'priceIntent',
  'kosher',
  'glutenFree',
  'accessible',
  'parking',
  'veganFriendly',
  'vegetarianFriendly',
  'vibeRomantic',
  'vibeQuiet',
  'vibeFamily',
  'vibeLaptop',
];

export function getConstraintDefinition(key: ConstraintKey): ConstraintDefinition {
  return CONSTRAINTS_REGISTRY[key];
}
