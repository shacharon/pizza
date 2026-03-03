/**
 * Build response metadata array for applied filters (key + value + enforcement + source).
 * Uses constraints registry; does not change any filtering logic.
 */

import type { FilterAppliedMeta } from './constraints-metadata.types.js';
import { CONSTRAINTS_REGISTRY, CONSTRAINT_KEYS_ORDER } from './constraints-registry.js';
import type { ConstraintKey } from './constraints-registry.types.js';

/** Merged filters passed to post-filter (final shared + post-constraints). */
export interface FiltersForPostFilterShape {
  openState?: string | null;
  openAt?: unknown;
  openBetween?: unknown;
  priceLevel?: number | null;
  priceLevels?: number[] | null;
  priceIntent?: string | null;
  isKosher?: boolean | null;
  isGlutenFree?: boolean | null;
  requirements?: { accessible?: boolean | null; parking?: boolean | null } | null;
}

/**
 * Build meta array for filters that have an applied or extracted value.
 * Preserves existing appliedFilters semantics; adds enforcement + source per filter.
 */
export function buildFiltersWithMeta(filters: FiltersForPostFilterShape | null | undefined): FilterAppliedMeta[] {
  if (!filters) return [];

  const out: FilterAppliedMeta[] = [];

  const push = (key: ConstraintKey, value: string | number | boolean | null) => {
    const def = CONSTRAINTS_REGISTRY[key];
    if (!def) return;
    out.push({
      key,
      ...(value != null ? { value } : {}),
      enforcement: def.enforcement,
      source: def.source,
    });
  };

  // Map current pipeline fields to registry keys (order matches CONSTRAINT_KEYS_ORDER for stability)
  if (filters.openState != null && filters.openState !== '') {
    push('openState', filters.openState);
  }
  if (filters.priceLevel != null) {
    push('priceRange', filters.priceLevel);
  }
  if (filters.priceIntent != null && filters.priceIntent !== '') {
    push('priceIntent', filters.priceIntent);
  }
  if (filters.isKosher === true) {
    push('kosher', true);
  }
  if (filters.isGlutenFree === true) {
    push('glutenFree', true);
  }
  const req = filters.requirements;
  if (req?.accessible === true) {
    push('accessible', true);
  }
  if (req?.parking === true) {
    push('parking', true);
  }

  // Sort by registry order so response is deterministic
  const order = new Map(CONSTRAINT_KEYS_ORDER.map((k, i) => [k, i]));
  out.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));

  return out;
}
