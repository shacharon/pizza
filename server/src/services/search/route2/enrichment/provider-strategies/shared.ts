/**
 * Shared selection helpers: URL validation, scoring, normalization.
 * Used by Tenbis and Mishloha strategies (same behavior as today).
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import type { ProviderSearchConfig } from './types.js';

export function isValidUrl(url: string, config: ProviderSearchConfig): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    const hostMatches = config.allowedHosts.some((allowedHost) => {
      if (allowedHost.startsWith('*.')) {
        const baseDomain = allowedHost.substring(2).toLowerCase();
        return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
      }
      return hostname === allowedHost.toLowerCase();
    });

    if (!hostMatches) {
      logger.info(
        {
          event: 'provider_url_rejected',
          provider: config.provider,
          url,
          hostname,
          allowedHosts: config.allowedHosts,
          reason: 'host_not_in_allowlist',
        },
        '[BraveAdapter] URL rejected: host not in allowlist'
      );
      return false;
    }

    if (config.requiredPathSegments && config.requiredPathSegments.length > 0) {
      const hasRequiredPath = config.requiredPathSegments.some((segment) =>
        pathname.includes(segment.toLowerCase())
      );
      if (!hasRequiredPath) {
        logger.info(
          {
            event: 'provider_url_rejected',
            provider: config.provider,
            url,
            pathname,
            requiredSegments: config.requiredPathSegments,
            reason: 'missing_required_path_segment',
          },
          '[BraveAdapter] URL rejected: missing required path segment'
        );
        return false;
      }
    }

    if (config.provider === 'wolt') {
      if (!pathname.includes('/isr/')) {
        logger.info(
          {
            event: 'provider_url_rejected',
            provider: config.provider,
            url,
            pathname,
            reason: 'wrong_country',
          },
          '[BraveAdapter] Wolt URL rejected: not Israeli restaurant (missing /isr/)'
        );
        return false;
      }
      if (!pathname.includes('/restaurant/')) {
        logger.info(
          {
            event: 'provider_url_rejected',
            provider: config.provider,
            url,
            pathname,
            reason: 'wrong_country',
          },
          '[BraveAdapter] Wolt URL rejected: not a restaurant page (missing /restaurant/)'
        );
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function scoreUrl(
  url: string,
  normalizedName: string,
  normalizedCity: string | null
): number {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    let score = 1;
    if (normalizedCity && pathname.includes(normalizedCity)) {
      score += 2;
    }
    if (pathname.includes(normalizedName)) {
      score += 3;
    }
    return score;
  } catch {
    return 0;
  }
}

export function normalizeForSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Extract Wolt city slug from path: /en/isr/{citySlug}/restaurant/... */
export function getWoltCitySlugFromPath(pathname: string): string | null {
  const m = pathname.match(/\/isr\/([^/]+)\/restaurant\//i);
  return m && m[1] ? m[1].toLowerCase() : null;
}

/** Noise words to ignore when matching restaurant names (generic terms) */
const NAME_NOISE = new Set([
  'restaurant', 'restaurants', 'pizza', 'cafe', 'coffee', 'food', 'kitchen',
  'מסעדת', 'מסעדות', 'פיצה', 'קפה', 'אוכל', 'מטבח',
  'the', 'and', 'of', 'in', 'on', 'at', 'ה', 'ו', 'ב', 'ל',
]);

/**
 * Tokenize for name matching: lowercase, alphanumeric + spaces/hyphens, min length 2.
 */
function tokenizeForNameMatch(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-/|]/g, ' ')
    .replace(/[^a-z0-9\s\u0590-\u05ff]/g, ' ');
  return normalized
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !NAME_NOISE.has(s));
}

/**
 * Extract first segment from Brave title (e.g. "Cicchetti | Tel Aviv | Wolt" -> "Cicchetti").
 */
export function getTitleNameSegment(title: string): string {
  const first = title.split('|')[0];
  return (first ?? title).trim();
}

/**
 * Extract slug from URL path (last non-empty segment before query).
 * e.g. .../restaurant/cicchetti -> cicchetti, .../delivery/30553/amore-mio -> amore-mio
 */
export function getSlugFromPath(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last ? decodeURIComponent(last).toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Returns true if the requested restaurant name matches the candidate (Brave title + URL slug).
 * Requires at least one significant token from the requested name to appear in the candidate.
 * Used to avoid wrong-restaurant links (e.g. Cafe Italia vs Cafe Cafe, Cicchetti vs Eataliano).
 */
export function nameMatchesCandidate(
  requestedName: string,
  candidateTitle: string,
  candidateUrl: string
): boolean {
  const requestedTokens = tokenizeForNameMatch(requestedName);
  if (requestedTokens.length === 0) {
    return true;
  }
  const titlePart = getTitleNameSegment(candidateTitle);
  const slugPart = getSlugFromPath(candidateUrl);
  const candidateTokens = tokenizeForNameMatch(`${titlePart} ${slugPart}`);
  if (candidateTokens.length === 0) {
    return false;
  }
  for (const rt of requestedTokens) {
    for (const ct of candidateTokens) {
      if (rt === ct || ct.includes(rt) || rt.includes(ct)) {
        return true;
      }
    }
  }
  return false;
}
