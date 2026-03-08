/**
 * Wolt Deterministic Verifier
 *
 * Strict verification step BEFORE setting wolt=FOUND / publishing FOUND.
 * - Domain allowlist: wolt.com
 * - Path must contain: /restaurant/ (plus numeric/slug after)
 * - City: canonical map (HE/EN variants → same key); missing city in URL = unknown (do not fail)
 * - Name score: shared normalization + Jaccard token overlap, threshold 0.35
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
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

const WOLT_DOMAIN_ALLOWLIST = ['wolt.com'];
/** Path must contain /restaurant/ or /venue/ (venue = restaurant page on Wolt). */
const WOLT_PATH_RESTAURANT = '/restaurant/';
const WOLT_PATH_VENUE = '/venue/';

export interface WoltVerifierInput {
  candidateUrl: string;
  candidateTitle?: string | null;
  candidateSnippet?: string | null;
  /** City from Google Place (address components / formattedAddress); passed as cityText from intent. */
  googleCity: string | null | undefined;
  /** Restaurant name from Google Place (displayName). */
  googleRestaurantName: string;
  /** Optional place ID for DEBUG logging. */
  placeId?: string;
}

export interface WoltVerifierResult {
  verified: boolean;
  reason?: string;
}

/**
 * Parse city slug from Wolt URL path: /en/isr/<citySlug>/(restaurant|venue)/...
 * Returns the segment between /isr/ and /restaurant/ or /venue/.
 */
function extractCityFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const isrIdx = path.indexOf('/isr/');
    if (isrIdx === -1) return null;
    const afterIsr = path.slice(isrIdx + 5);
    const restIdx = afterIsr.indexOf(WOLT_PATH_RESTAURANT);
    const venueIdx = afterIsr.indexOf(WOLT_PATH_VENUE);
    const idx =
      restIdx >= 0 && (venueIdx < 0 || restIdx <= venueIdx)
        ? restIdx
        : venueIdx >= 0
          ? venueIdx
          : -1;
    if (idx <= 0) return null;
    const citySegment = afterIsr.slice(0, idx).replace(/^\/+|\/+$/g, '');
    return citySegment || null;
  } catch {
    return null;
  }
}

/** Extract slug from path after /restaurant/ or /venue/ for name scoring. Uses decoded path so Hebrew works. */
function slugFromWoltUrl(candidateUrl: string): string {
  try {
    const pathRaw = new URL(candidateUrl).pathname;
    const path = safeDecodePath(pathRaw);
    const pathLower = path.toLowerCase();
    const seg = pathLower.includes(WOLT_PATH_RESTAURANT) ? WOLT_PATH_RESTAURANT : pathLower.includes(WOLT_PATH_VENUE) ? WOLT_PATH_VENUE : null;
    if (seg) {
      const idx = pathLower.indexOf(seg);
      const after = path.slice(idx + seg.length).replace(/\/+$/, '');
      const slug = after.split('/')[0]?.replace(/-/g, ' ') ?? '';
      if (slug) return slug;
    }
  } catch {
    // ignore
  }
  return '';
}

/** Path slug for secondary name scoring (only used when primary title/snippet passed). */
function pathSlugFromWoltUrl(candidateUrl: string): string {
  const slug = slugFromWoltUrl(candidateUrl);
  return slug.replace(/-/g, ' ');
}

/**
 * Verify Wolt candidate BEFORE setting FOUND.
 * Returns { verified: true } only when all checks pass; otherwise { verified: false, reason }.
 */
export function verifyWoltCandidate(input: WoltVerifierInput): WoltVerifierResult {
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

    // Domain allowlist: wolt.com only
    const domainOk =
      hostname === 'wolt.com' || hostname.endsWith('.wolt.com');
    if (!domainOk) {
      return { verified: false, reason: 'domain_not_allowlisted' };
    }

    // Path must contain /restaurant/ or /venue/
    const pathLower = pathname.toLowerCase();
    if (!pathLower.includes(WOLT_PATH_RESTAURANT) && !pathLower.includes(WOLT_PATH_VENUE)) {
      return { verified: false, reason: 'path_missing_restaurant' };
    }

    if (googleCity == null || String(googleCity).trim() === '') {
      return { verified: false, reason: 'google_city_missing' };
    }

    const parsedSlug = extractCityFromUrl(candidateUrl);
    // Missing city in URL = unknown: do not fail; only compare when both sides have a city.
    if (parsedSlug != null) {
      const expectedCanonical = toCanonicalCity(String(googleCity).trim());
      const parsedCanonical = toCanonicalCity(parsedSlug);
      if (expectedCanonical != null && parsedCanonical != null && expectedCanonical !== parsedCanonical) {
        logger.debug(
          {
            event: 'wolt_city_match',
            googleCity,
            parsedSlug,
            expectedCanonical,
            parsedCanonical,
          },
          '[WoltVerifier] City canonical mismatch'
        );
        return { verified: false, reason: 'city_mismatch' };
      }
    }

    // Name: title/snippet primary; path as primary when empty. Bilingual "A | B" => max score over variants.
    const urlPathDecoded = safeDecodePath(pathname);
    const pathSlug = pathSlugFromWoltUrl(candidateUrl);
    const pathStrictAllowed = true; // domain + path checks passed above
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
      [candidateTitle ?? '', candidateSnippet ?? ''].join(' ').trim() || extractCandidateNameFromUrl('wolt', candidateUrl);
    logProviderVerifierScores({
      provider: 'wolt',
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
        providerId: 'wolt',
        placeId: placeId ?? undefined,
        tokensRestaurant,
        tokensCandidate,
        matchedTokens,
        nameScore,
        cityScore,
        usedFields,
        primaryMatch,
      },
      '[WoltVerifier] Scoring'
    );

    if (nameOk && cityOk) {
      return { verified: true };
    }
    logProviderVerifierScoring({
      providerId: 'wolt',
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
