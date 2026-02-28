/**
 * Search URL params: serialize/deserialize for browser history.
 * SSR-safe (no window). Used by SearchPageComponent for pushState and hydration.
 */

import type { ParamMap } from '@angular/router';
import type { SearchFilters } from '../../../domain/types/search.types';
import type { SortKey } from '../../../facades/search.facade.types';

const SORT_KEYS: readonly SortKey[] = ['BEST_MATCH', 'CLOSEST', 'RATING_DESC', 'PRICE_ASC'];
const DIETARY_VALUES = ['glutenfree', 'kosher', 'vegan'] as const;

export interface SearchParamsState {
  query: string;
  openNow?: boolean;
  priceLevel?: number;
  dietary?: string[];
  sort?: SortKey;
  lat?: number;
  lng?: number;
}

export interface DeserializedSearchParams {
  query: string;
  filters?: SearchFilters;
  sort?: SortKey;
  lat?: number;
  lng?: number;
}

/** Serialize search state to query params (only defined values). */
export function serializeSearchParams(state: SearchParamsState): Record<string, string> {
  const params: Record<string, string> = {};
  const q = (state.query || '').trim();
  if (q) params['q'] = q;
  if (state.openNow === true) params['openNow'] = '1';
  if (state.openNow === false) params['openNow'] = '0';
  if (state.priceLevel != null && state.priceLevel >= 1 && state.priceLevel <= 4) {
    params['price'] = String(state.priceLevel);
  }
  if (state.dietary?.length) params['dietary'] = state.dietary.join(',');
  if (state.sort && SORT_KEYS.includes(state.sort)) params['sort'] = state.sort;
  if (state.lat != null && state.lng != null && Number.isFinite(state.lat) && Number.isFinite(state.lng)) {
    params['lat'] = String(state.lat);
    params['lng'] = String(state.lng);
  }
  return params;
}

/** Deserialize ParamMap (or params record) to search state. */
export function deserializeSearchParams(params: ParamMap | Record<string, string | null | undefined>): DeserializedSearchParams {
  const get = (key: string): string | null => {
    if ('get' in params && typeof (params as ParamMap).get === 'function') {
      return (params as ParamMap).get(key);
    }
    const v = (params as Record<string, string | null | undefined>)[key];
    return v != null ? String(v) : null;
  };
  const query = (get('q') || '').trim();
  const result: DeserializedSearchParams = { query };

  const filters: SearchFilters = {};
  const openNowVal = get('openNow');
  if (openNowVal === '1') filters.openNow = true;
  else if (openNowVal === '0') filters.openNow = false;

  const priceVal = get('price');
  if (priceVal) {
    const n = parseInt(priceVal, 10);
    if (!isNaN(n) && n >= 1 && n <= 4) filters.priceLevel = n;
  }

  const dietaryVal = get('dietary');
  if (dietaryVal) {
    const list = dietaryVal.split(',').map(s => s.trim().toLowerCase()).filter(s => DIETARY_VALUES.includes(s as any));
    if (list.length) filters.dietary = list;
  }
  if (Object.keys(filters).length > 0) result.filters = filters;

  const sortVal = get('sort');
  if (sortVal && SORT_KEYS.includes(sortVal as SortKey)) result.sort = sortVal as SortKey;

  const latVal = get('lat');
  const lngVal = get('lng');
  if (latVal != null && lngVal != null) {
    const lat = parseFloat(latVal);
    const lng = parseFloat(lngVal);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      result.lat = lat;
      result.lng = lng;
    }
  }

  return result;
}

/** Build filter chip IDs from URL filters + sort (for hydrating SearchStateHandler). */
export function filterChipIdsFromParams(deserialized: DeserializedSearchParams): Set<string> {
  const ids = new Set<string>();
  const f = deserialized.filters;
  if (f?.openNow === true) ids.add('opennow');
  if (f?.openNow === false) ids.add('closednow');
  if (f?.priceLevel != null) ids.add(`price<=${f.priceLevel}`);
  f?.dietary?.forEach(d => ids.add(d));
  return ids;
}
