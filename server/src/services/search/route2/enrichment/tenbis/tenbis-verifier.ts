/**
 * 10bis Deterministic Verifier
 *
 * Verification step BEFORE setting tenbis=FOUND / publishing FOUND.
 * - Domain allowlist: 10bis.co.il (including www.10bis.co.il)
 * - Path: /next/restaurants/menu/delivery/<id> or /next/en/ or /next/he/ variant
 * - Reject non-restaurant pages (search/category/promo)
 * - City check is SOFT: do not require city in URL; only reject if candidate has a different known city
 * - Name score: shared normalization + Jaccard (HE/EN transliteration), threshold 0.6
 */

import {
  NAME_SCORE_VERIFIED_THRESHOLD,
  NAME_SCORE_PATH_STRICT_THRESHOLD,
  CITY_SCORE_MIN_RELAXED,
  toCanonicalCity,
  safeDecodePath,
  normalizeNameForVerifier,
  tokensFromNormalized,
  scoreNameCandidateBilingual,
  scoreCityCandidate,
  logProviderVerifierScoring,
  logProviderVerifierScores,
  extractCandidateNameFromUrl,
} from '../provider/provider-verifier-utils.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

const TENBIS_DOMAIN = '10bis.co.il';

/** Path: /next/restaurants/... or /next/en/restaurants/... or /next/he/restaurants/... then menu/delivery/<digits> */
const DELIVERY_MENU_PATH_REGEX =
  /^\/next\/(?:en\/|he\/)?restaurants\/menu\/delivery\/\d+/;
/** Reject pages with these in path (search/category/promo) */
const PATH_REJECT_SEGMENTS = ['/search', '/category', '/promo'];

export interface TenbisVerifierInput {
  candidateUrl: string;
  candidateTitle?: string | null;
  candidateSnippet?: string | null;
  /** City from Google Place (passed as cityText from intent). */
  googleCity: string | null | undefined;
  /** Restaurant name from Google Place (displayName). */
  googleRestaurantName: string;
  placeId?: string;
}

export interface TenbisVerifierResult {
  verified: boolean;
  reason?: string;
}

function extractCityFromTitle(title: string): string | null {
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = normalized.split(/\s*[-–—|]\s*/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (last != null) {
      const trimmed = last.trim();
      if (trimmed.length >= 2 && trimmed.length <= 50) return trimmed;
    }
  }
  return null;
}

function extractCityFromSnippet(snippet: string): string | null {
  const lower = snippet.toLowerCase();
  const inMatch = lower.match(/\bin\s+([a-z\u0590-\u05ff\s\-]{2,50}?)(?:\s*[.,]|$)/);
  const inGroup = inMatch?.[1];
  if (inGroup != null) return inGroup.trim().replace(/\s+/g, ' ') || null;
  const commaMatch = lower.match(/,\s*([a-z\u0590-\u05ff\s\-]{2,50}?)(?:\s*[.,]|$)/);
  const commaGroup = commaMatch?.[1];
  if (commaGroup != null) return commaGroup.trim().replace(/\s+/g, ' ') || null;
  return null;
}

/**
 * 10bis URLs typically don't include city in path; optional fallback if a pattern exists.
 */
function extractCityFromUrl(_url: string): string | null {
  return null;
}

function computeCandidateCity(
  candidateTitle: string | undefined | null,
  candidateSnippet: string | undefined | null,
  candidateUrl: string
): string | null {
  if (candidateTitle?.trim()) {
    const fromTitle = extractCityFromTitle(candidateTitle);
    if (fromTitle) return fromTitle;
  }
  if (candidateSnippet?.trim()) {
    const fromSnippet = extractCityFromSnippet(candidateSnippet);
    if (fromSnippet) return fromSnippet;
  }
  return extractCityFromUrl(candidateUrl);
}

function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract slug from path after /menu/ for name scoring. Uses decoded path so Hebrew works. */
function slugFromTenbisUrl(candidateUrl: string): string {
  try {
    const pathRaw = new URL(candidateUrl).pathname;
    const path = safeDecodePath(pathRaw);
    if (!path.toLowerCase().includes('/menu/')) return '';
    const idx = path.toLowerCase().indexOf('/menu/');
    const afterMenu = path.slice(idx + 6).replace(/\/+$/, '');
    const segments = afterMenu.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && !/^\d+$/.test(last)) return last.replace(/-/g, ' ');
  } catch {
    // ignore
  }
  return '';
}

function pathSlugFromTenbisUrl(candidateUrl: string): string {
  const slug = slugFromTenbisUrl(candidateUrl);
  return slug.replace(/-/g, ' ');
}

/**
 * Verify 10bis candidate BEFORE setting FOUND.
 */
export function verifyTenbisCandidate(input: TenbisVerifierInput): TenbisVerifierResult {
  const {
    candidateUrl,
    candidateTitle,
    candidateSnippet,
    googleCity,
    googleRestaurantName,
    placeId,
  } = input;

  try {
    const parsed = new URL(candidateUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;
    const pathLower = pathname.toLowerCase();

    if (hostname !== TENBIS_DOMAIN && !hostname.endsWith(`.${TENBIS_DOMAIN}`)) {
      return { verified: false, reason: 'domain_not_allowlisted' };
    }

    if (!DELIVERY_MENU_PATH_REGEX.test(pathLower)) {
      return { verified: false, reason: 'path_must_match_delivery_menu' };
    }

    for (const seg of PATH_REJECT_SEGMENTS) {
      if (pathLower.includes(seg)) {
        return { verified: false, reason: 'non_restaurant_page' };
      }
    }

    const googleCityNorm =
      googleCity != null && String(googleCity).trim() !== ''
        ? normalizeCity(String(googleCity).trim())
        : null;

    if (googleCityNorm == null || googleCityNorm === '') {
      return { verified: false, reason: 'google_city_missing' };
    }

    const candidateCity = computeCandidateCity(
      candidateTitle,
      candidateSnippet,
      candidateUrl
    );

    // SOFT city check: only reject when candidate has a different known city (from title/snippet/URL)
    if (candidateCity != null && candidateCity.trim() !== '') {
      const candidateCityNorm = normalizeCity(candidateCity);
      if (candidateCityNorm !== googleCityNorm) {
        return { verified: false, reason: 'city_mismatch' };
      }
    }

    const urlPathDecoded = safeDecodePath(pathname);
    const pathSlug = pathSlugFromTenbisUrl(candidateUrl);
    const pathStrictAllowed = true;
    const nameResult = scoreNameCandidateBilingual(
      { title: candidateTitle ?? null, snippet: candidateSnippet ?? null, pathSlug },
      googleRestaurantName
    );
    const { nameScore, primaryMatch, matchedTokens, usedFields, tokensRestaurant, tokensCandidate } = nameResult;
    const cityScore = scoreCityCandidate(
      { title: candidateTitle ?? null, snippet: candidateSnippet ?? null },
      googleCity
    );
    const nameOk =
      nameScore >= NAME_SCORE_VERIFIED_THRESHOLD ||
      (pathStrictAllowed && nameScore >= NAME_SCORE_PATH_STRICT_THRESHOLD);
    const cityOk = cityScore >= CITY_SCORE_MIN_RELAXED;
    const rejectReason = !nameOk ? `name_score_too_low:${nameScore.toFixed(2)}` : !cityOk ? `city_score_too_low:${cityScore.toFixed(2)}` : undefined;

    const candidateNameRaw =
      [candidateTitle ?? '', candidateSnippet ?? ''].join(' ').trim() || extractCandidateNameFromUrl('10bis', candidateUrl);
    logProviderVerifierScores({
      provider: '10bis',
      restaurantNameRaw: googleRestaurantName,
      restaurantNameNorm: tokensRestaurant.join(' '),
      candidateNameRaw,
      candidateNameNorm: tokensCandidate.join(' '),
      nameScore,
      cityText: String(googleCity ?? ''),
      cityNorm: toCanonicalCity(String(googleCity ?? '').trim()) ?? '',
      cityScore,
      url: candidateUrl,
      verified: nameOk && cityOk,
      ...(rejectReason != null ? { rejectionReason: rejectReason } : {}),
    });

    logger.debug(
      {
        event: 'provider_verifier_scoring_debug',
        providerId: 'tenbis',
        placeId: placeId ?? undefined,
        tokensRestaurant,
        tokensCandidate,
        matchedTokens,
        nameScore,
        cityScore,
        usedFields,
        primaryMatch,
      },
      '[TenbisVerifier] Scoring'
    );

    if (nameOk && cityOk) {
      return { verified: true };
    }
    logProviderVerifierScoring({
      providerId: 'tenbis',
      ...(placeId != null && placeId !== '' ? { placeId } : {}),
      restaurantName: googleRestaurantName,
      cityText: String(googleCity ?? ''),
      candidate: {
        url: candidateUrl,
        host: hostname,
        path: pathname,
        pathDecoded: urlPathDecoded,
        ...(candidateTitle != null && candidateTitle !== '' ? { title: candidateTitle } : {}),
        ...(candidateSnippet != null && candidateSnippet !== '' ? { snippet: candidateSnippet } : {}),
      },
      normRestaurant: tokensRestaurant.join(' '),
      normCandidateTitle: usedFields.includes('title') ? (candidateTitle ?? '') : '',
      normCandidatePath: pathSlug,
      tokensRestaurant,
      tokensCandidateTitle: tokensCandidate,
      tokensCandidatePath: tokensFromNormalized(normalizeNameForVerifier(pathSlug)),
      nameScore,
      cityScore,
      decisionReason: rejectReason ?? 'name_score_too_low',
    });
    return {
      verified: false,
      reason: rejectReason ?? 'name_score_too_low',
    };
  } catch (e) {
    return {
      verified: false,
      reason: e instanceof Error ? e.message : 'invalid_url',
    };
  }
}
