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

/** Result of provider-specific verification (e.g. page structure, city slug). */
export interface VerifyResult {
  accept: boolean;
  reason?: string;
}

/** Verifier called after strategy picks a candidate; can reject before returning URL. */
export interface ProviderVerifier {
  verify(params: {
    name: string;
    cityText: string | null;
    url: string;
    title?: string;
  }): VerifyResult;
}
