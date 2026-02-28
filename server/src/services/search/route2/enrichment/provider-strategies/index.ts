/**
 * Provider-specific URL selection strategies.
 * Brave adapter calls selectBestUrlForProvider after each search attempt.
 */

import type { ProviderSearchConfig, SelectUrlParams } from './types.js';
import { selectWoltUrl } from './wolt.strategy.js';
import { selectTenbisUrl } from './tenbis.strategy.js';
import { selectMishlohaUrl } from './mishloha.strategy.js';

export type { ProviderSearchConfig, SelectUrlParams, VerifyResult, ProviderVerifier } from './types.js';
export { getWoltSlugsForCity } from './wolt-city-slugs.js';
export { isValidUrl, scoreUrl, normalizeForSlug, getWoltCitySlugFromPath } from './shared.js';

/**
 * Select the best URL from search results using the provider-specific strategy.
 */
export function selectBestUrlForProvider(params: SelectUrlParams): string | null {
  const { config } = params;
  switch (config.provider) {
    case 'wolt':
      return selectWoltUrl(params);
    case 'tenbis':
      return selectTenbisUrl(params);
    case 'mishloha':
      return selectMishlohaUrl(params);
    default:
      return null;
  }
}
