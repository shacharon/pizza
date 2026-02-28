/**
 * Types for provider-specific selection strategies.
 */

import type { SearchResult } from '../brave-search-client.js';

export type { SearchResult };

/** Matches Brave adapter ProviderSearchConfig for selection logic. */
export interface ProviderSearchConfig {
  provider: 'wolt' | 'tenbis' | 'mishloha';
  allowedHosts: string[];
  requiredPathSegments?: string[] | undefined;
}

export interface SelectUrlParams {
  results: SearchResult[];
  name: string;
  cityText: string | null;
  config: ProviderSearchConfig;
}

export type SelectUrlFn = (params: SelectUrlParams) => string | null;
