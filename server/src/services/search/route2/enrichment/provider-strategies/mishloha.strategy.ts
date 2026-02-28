/**
 * Mishloha selection: top 5 results, name match required.
 * Phase 1: only return a URL if the candidate title/slug matches the requested restaurant name.
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import { isValidUrl, nameMatchesCandidate } from './shared.js';
import type { SelectUrlParams } from './types.js';

const TOP_N = 5;

export function selectMishlohaUrl(params: SelectUrlParams): string | null {
  const { results, name, config } = params;

  const valid = results.filter((r) => isValidUrl(r.url, config));
  const top5 = valid.slice(0, TOP_N);

  if (top5.length === 0) {
    return null;
  }

  for (const r of top5) {
    if (nameMatchesCandidate(name, r.title, r.url)) {
      logger.debug(
        {
          event: 'mishloha_strategy_name_match',
          url: r.url,
          requestedName: name,
          candidateTitle: r.title,
        },
        '[MishlohaStrategy] Name match in top 5, returning first match'
      );
      return r.url;
    }
  }

  logger.debug(
    {
      event: 'mishloha_strategy_no_name_match',
      requestedName: name,
      top5Urls: top5.map((r) => r.url),
    },
    '[MishlohaStrategy] None of top 5 matched name, returning NOT_FOUND'
  );
  return null;
}
