/**
 * Response metadata shape for applied/extracted filters.
 * Every applied or extracted filter can include enforcement + source in the response.
 */

import type { ConstraintEnforcement, ConstraintKey, ConstraintSource } from './constraints-registry.types.js';

/** Metadata for a single filter in the response; value is optional (e.g. boolean or string). */
export interface FilterAppliedMeta {
  key: ConstraintKey;
  value?: string | number | boolean | null;
  enforcement: ConstraintEnforcement;
  source: ConstraintSource;
}
