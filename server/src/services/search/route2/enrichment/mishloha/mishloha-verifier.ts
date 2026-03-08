/**
 * Mishloha Deterministic Verifier
 *
 * Strict verification step BEFORE setting mishloha=FOUND / publishing FOUND.
 * - Domain allowlist: mishloha.co.il
 * - Path: allowlisted restaurant paths only (/now/r/ or /r/ with slug); reject search/list pages
 * - Hash fragment no longer required (validate by domain + path only)
 * - City: canonical map; missing candidate city = unknown (do not fail)
 * - Name score: shared normalization + Jaccard, threshold 0.35
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

const MISHLOSHA_DOMAIN = 'mishloha.co.il';
/** Restaurant path: /now/r/<slug> or /r/<slug>; slug is non-empty, not just digits */
const MISHLOSHA_REST_PATH = /^\/(?:now\/)?r\/(?!inactive)[^/]+/;
/** Reject search/list pages */
const PATH_REJECT = [/\/search\b/, /\/list\b/];

const PATH_MUST_CONTAIN = '/r/';

export interface MishlohaVerifierInput {
  candidateUrl: string;
  candidateTitle?: string | null;
  candidateSnippet?: string | null;
  /** City from Google Place (passed as cityText from intent). */
  googleCity: string | null | undefined;
  /** Restaurant name from Google Place (displayName). */
  googleRestaurantName: string;
  /** Optional place ID for DEBUG logging. */
  placeId?: string;
}

export interface MishlohaVerifierResult {
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
 * Mishloha URLs may encode city in path; optional fallback.
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

/** Extract slug from path after /r/ for name scoring. Uses decoded path so Hebrew works. */
function slugFromMishlohaUrl(candidateUrl: string): string {
  try {
    const pathRaw = new URL(candidateUrl).pathname;
    const path = safeDecodePath(pathRaw);
    const idx = path.toLowerCase().indexOf(PATH_MUST_CONTAIN);
    if (idx !== -1) {
      const after = path.slice(idx + PATH_MUST_CONTAIN.length).replace(/\/+$/, '');
      const segment = after.split('/')[0]?.replace(/-/g, ' ') ?? '';
      if (segment && !/^\d+$/.test(segment)) return segment;
    }
  } catch {
    // ignore
  }
  return '';
}

function pathSlugFromMishlohaUrl(candidateUrl: string): string {
  const slug = slugFromMishlohaUrl(candidateUrl);
  return slug.replace(/-/g, ' ');
}

/**
 * Verify Mishloha candidate BEFORE setting FOUND.
 */
export function verifyMishlohaCandidate(input: MishlohaVerifierInput): MishlohaVerifierResult {
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

    if (hostname !== MISHLOSHA_DOMAIN && !hostname.endsWith(`.${MISHLOSHA_DOMAIN}`)) {
      return { verified: false, reason: 'domain_not_allowlisted' };
    }

    if (!pathLower.includes(PATH_MUST_CONTAIN)) {
      return { verified: false, reason: 'path_missing_r' };
    }

    // Path: allow /now/r/<slug> or /r/<slug>; reject /r/inactive/ and non-restaurant pages
    if (!MISHLOSHA_REST_PATH.test(pathLower)) {
      return { verified: false, reason: 'path_not_restaurant' };
    }
    for (const re of PATH_REJECT) {
      if (re.test(pathLower)) {
        return { verified: false, reason: 'non_restaurant_page' };
      }
    }

    if (googleCity == null || String(googleCity).trim() === '') {
      return { verified: false, reason: 'google_city_missing' };
    }

    const googleCanonical = toCanonicalCity(String(googleCity).trim());
    const candidateCity = computeCandidateCity(
      candidateTitle,
      candidateSnippet,
      candidateUrl
    );
    const candidateCanonical =
      candidateCity != null && candidateCity.trim() !== ''
        ? toCanonicalCity(candidateCity)
        : null;

    // City: only reject when both have city and they differ; missing candidate city = do not fail
    if (googleCanonical != null && candidateCanonical != null && googleCanonical !== candidateCanonical) {
      return { verified: false, reason: 'city_mismatch' };
    }

    const urlPathDecoded = safeDecodePath(pathname);
    const pathSlug = pathSlugFromMishlohaUrl(candidateUrl);
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
      [candidateTitle ?? '', candidateSnippet ?? ''].join(' ').trim() || extractCandidateNameFromUrl('mishloha', candidateUrl);
    logProviderVerifierScores({
      provider: 'mishloha',
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
        providerId: 'mishloha',
        placeId: placeId ?? undefined,
        tokensRestaurant,
        tokensCandidate,
        matchedTokens,
        nameScore,
        cityScore,
        usedFields,
        primaryMatch,
      },
      '[MishlohaVerifier] Scoring'
    );

    if (nameOk && cityOk) {
      return { verified: true };
    }
    logProviderVerifierScoring({
      providerId: 'mishloha',
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
