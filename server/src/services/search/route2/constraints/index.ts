/**
 * Constraints contract: registry, types, and response metadata builder.
 */

export type {
  ConstraintKey,
  ConstraintEnforcement,
  ConstraintApplyStage,
  ConstraintSource,
  ConstraintUnknownPolicy,
  ConstraintDefinition,
} from './constraints-registry.types.js';
export { CONSTRAINTS_REGISTRY, CONSTRAINT_KEYS_ORDER, getConstraintDefinition } from './constraints-registry.js';
export type { FilterAppliedMeta } from './constraints-metadata.types.js';
export {
  buildFiltersWithMeta,
  type FiltersForPostFilterShape,
} from './build-filters-with-meta.js';
