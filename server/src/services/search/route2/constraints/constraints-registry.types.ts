/**
 * Constraints Registry Types
 * Single source of truth for filter keys and their contract (enforcement, stage, ui, unknown policy).
 */

/** Canonical filter keys used across pipeline and response metadata. */
export type ConstraintKey =
  | 'kosher'
  | 'accessible'
  | 'parking'
  | 'openState'
  | 'priceRange'
  | 'priceIntent'
  | 'glutenFree'
  | 'veganFriendly'
  | 'vegetarianFriendly'
  | 'vibeRomantic'
  | 'vibeQuiet'
  | 'vibeFamily'
  | 'vibeLaptop';

/** How the constraint is applied: hard = exclude non-matching, soft = down-rank, hint = metadata only, not_applied = extracted but not used. */
export type ConstraintEnforcement = 'hard' | 'soft' | 'hint' | 'not_applied';

/** Pipeline stage where the constraint is applied (or not_applied). */
export type ConstraintApplyStage = 'pre_google' | 'post_filter' | 'ranking_only' | 'not_applied';

/** Where the constraint value was extracted from. */
export type ConstraintSource = 'base_filters_llm' | 'post_constraints_llm' | 'intent' | 'resolver' | 'not_extracted';

/** How to treat places with unknown value for this constraint. */
export type ConstraintUnknownPolicy = 'exclude' | 'include' | 'treat_as_match' | 'not_applied';

/** Single constraint definition in the registry. */
export interface ConstraintDefinition {
  key: ConstraintKey;
  source: ConstraintSource;
  enforcement: ConstraintEnforcement;
  applyStage: ConstraintApplyStage;
  uiLabel: string;
  unknownPolicy: ConstraintUnknownPolicy;
}
