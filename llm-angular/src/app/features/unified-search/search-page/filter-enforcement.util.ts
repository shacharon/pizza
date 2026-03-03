/**
 * Filter display utilities: group by enforcement, display labels.
 * Uses meta.filtersWithMeta from search response (no backend changes).
 */

import type { FilterAppliedMeta } from '../../../domain/types/search.types';

export type EnforcementGroup = 'hard' | 'soft' | 'hint' | 'not_applied';

export interface FiltersByEnforcement {
  hard: FilterAppliedMeta[];
  soft: FilterAppliedMeta[];
  hint: FilterAppliedMeta[];
  not_applied: FilterAppliedMeta[];
}

/** Group filters by enforcement for UI sections. */
export function groupFiltersByEnforcement(
  filtersWithMeta: FilterAppliedMeta[] | null | undefined
): FiltersByEnforcement {
  const empty: FiltersByEnforcement = { hard: [], soft: [], hint: [], not_applied: [] };
  if (!filtersWithMeta?.length) return empty;

  const out: FiltersByEnforcement = { hard: [], soft: [], hint: [], not_applied: [] };
  for (const f of filtersWithMeta) {
    const e = f.enforcement;
    if (e === 'hard') out.hard.push(f);
    else if (e === 'soft') out.soft.push(f);
    else if (e === 'hint') out.hint.push(f);
    else if (e === 'not_applied') out.not_applied.push(f);
  }
  return out;
}

/** Compact display label for constraint key (from metadata). */
const FILTER_LABELS: Record<string, string> = {
  kosher: 'Kosher',
  accessible: 'Accessible',
  parking: 'Parking',
  openState: 'Open now',
  priceRange: 'Price',
  priceIntent: 'Price intent',
  glutenFree: 'Gluten free',
  veganFriendly: 'Vegan',
  vegetarianFriendly: 'Vegetarian',
  vibeRomantic: 'Romantic',
  vibeQuiet: 'Quiet',
  vibeFamily: 'Family',
  vibeLaptop: 'Laptop friendly',
};

export function getFilterDisplayLabel(key: string): string {
  return FILTER_LABELS[key] ?? key;
}

/** Format filter value for badge (e.g. openState "OPEN_NOW" → "Open now", price 2 → "$$"). */
export function getFilterValueLabel(item: FilterAppliedMeta): string {
  const v = item.value;
  if (v === true) return '';
  if (v === false) return '';
  if (item.key === 'openState' && typeof v === 'string') {
    if (v === 'OPEN_NOW') return 'Open now';
    if (v === 'CLOSED_NOW') return 'Closed';
    if (v === 'OPEN_AT') return 'Open at';
    if (v === 'OPEN_BETWEEN') return 'Open between';
  }
  if (item.key === 'priceRange' && typeof v === 'number') return '€'.repeat(v);
  if (item.key === 'priceIntent' && typeof v === 'string') {
    if (v === 'CHEAP') return 'Budget';
    if (v === 'EXPENSIVE') return 'Upscale';
    if (v === 'MID') return 'Mid-range';
  }
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return '';
}
