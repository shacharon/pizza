/**
 * Wolt selection: top 5 results, city match (when given) + name match required.
 * Phase 1: only return a URL if city matches and candidate title/slug matches requested name.
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import { isValidUrl, getWoltCitySlugFromPath, scoreUrl, normalizeForSlug, nameMatchesCandidate } from './shared.js';
import { getWoltSlugsForCity } from './wolt-city-slugs.js';
import type { SelectUrlParams } from './types.js';

const TOP_N = 5;

export function selectWoltUrl(params: SelectUrlParams): string | null {
  const { results, name, cityText, config } = params;

  const valid = results.filter((r) => isValidUrl(r.url, config));
  const top5 = valid.slice(0, TOP_N);

  if (top5.length === 0) {
    return null;
  }

  const allowedSlugs = getWoltSlugsForCity(cityText ?? null);

  if (cityText && allowedSlugs && allowedSlugs.length > 0) {
    for (const r of top5) {
      try {
        const pathname = new URL(r.url).pathname;
        const urlCitySlug = getWoltCitySlugFromPath(pathname);
        if (urlCitySlug && allowedSlugs.includes(urlCitySlug) && nameMatchesCandidate(name, r.title, r.url)) {
          logger.debug(
            {
              event: 'wolt_strategy_city_and_name_match',
              url: r.url,
              urlCitySlug,
              requestedCity: cityText,
              requestedName: name,
            },
            '[WoltStrategy] City + name match in top 5, returning first match'
          );
          return r.url;
        }
      } catch {
        continue;
      }
    }
    logger.debug(
      {
        event: 'wolt_strategy_no_city_match',
        requestedCity: cityText,
        allowedSlugs,
        top5Urls: top5.map((r) => r.url),
      },
      '[WoltStrategy] None of top 5 matched city, returning NOT_FOUND'
    );
    return null;
  }

  const withNameMatch = top5.filter((r) => nameMatchesCandidate(name, r.title, r.url));
  if (withNameMatch.length === 0) {
    logger.debug(
      { event: 'wolt_strategy_no_name_match', requestedName: name, top5Urls: top5.map((r) => r.url) },
      '[WoltStrategy] None of top 5 matched name (no city), returning NOT_FOUND'
    );
    return null;
  }
  const normalizedName = normalizeForSlug(name);
  const normalizedCity = cityText ? normalizeForSlug(cityText) : null;
  const scored = withNameMatch
    .map((r) => ({ url: r.url, score: scoreUrl(r.url, normalizedName, normalizedCity) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return null;
  }
  const first = scored[0];
  return first ? first.url : null;
}
