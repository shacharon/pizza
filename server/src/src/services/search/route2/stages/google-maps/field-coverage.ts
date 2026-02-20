/**
 * Field Coverage Report: Google Places LIST → DTO → UI
 * Logs compact coverage (which fields present from Google, in DTO, used by UI).
 */

import { createHash } from 'node:crypto';

// Canonical Google (New API) keys we check on raw place
const GOOGLE_KEYS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'businessStatus',
  'currentOpeningHours',
  'photos',
  'types'
] as const;

// Canonical DTO keys we check on mapped result
const DTO_KEYS = [
  'placeId',
  'name',
  'rating',
  'userRatingsTotal',
  'priceLevel',
  'businessStatus',
  'openNow',
  'openClose',
  'location',
  'address',
  'photoReference',
  'tags',
  'category'
] as const;

// Keys the RestaurantCard UI uses (from DTO)
const UI_USED_KEYS = [
  'name',
  'rating',
  'userRatingsTotal',
  'priceLevel',
  'openNow',
  'openClose',
  'address',
  'photoReference',
  'tags',
  'category',
  'providers',
  'dietaryHints'
];

export interface FieldCoverageItem {
  googlePresent: string[];
  dtoPresent: string[];
  uiUsed: string[];
  missingInDto: string[];
  missingInUi: string[];
}

function hasGoogleKey(place: any, key: string): boolean {
  switch (key) {
    case 'id':
      return place?.id != null;
    case 'displayName':
      return place?.displayName?.text != null;
    case 'formattedAddress':
      return place?.formattedAddress != null && place.formattedAddress !== '';
    case 'location':
      return place?.location?.latitude != null && place?.location?.longitude != null;
    case 'rating':
      return place?.rating != null;
    case 'userRatingCount':
      return place?.userRatingCount != null;
    case 'priceLevel':
      return place?.priceLevel != null;
    case 'businessStatus':
      return place?.businessStatus != null;
    case 'currentOpeningHours':
      return place?.currentOpeningHours != null;
    case 'photos':
      return Array.isArray(place?.photos) && place.photos.length > 0;
    case 'types':
      return Array.isArray(place?.types) && place.types.length > 0;
    default:
      return false;
  }
}

function hasDtoKey(dto: any, key: string): boolean {
  switch (key) {
    case 'placeId':
      return dto?.placeId != null;
    case 'name':
      return dto?.name != null && dto.name !== '';
    case 'rating':
      return dto?.rating != null;
    case 'userRatingsTotal':
      return dto?.userRatingsTotal != null;
    case 'priceLevel':
      return dto?.priceLevel != null;
    case 'businessStatus':
      return dto?.businessStatus != null;
    case 'openNow':
      return dto?.openNow !== undefined;
    case 'openClose':
      return dto?.openClose != null;
    case 'location':
      return dto?.location?.lat != null && dto?.location?.lng != null;
    case 'address':
      return dto?.address != null;
    case 'photoReference':
      return dto?.photoReference != null;
    case 'tags':
      return Array.isArray(dto?.tags) && dto.tags.length > 0;
    case 'category':
      return dto?.category != null;
    default:
      return false;
  }
}

/**
 * Compute coverage for one item: raw place, mapped DTO, and static UI-used list.
 */
export function getFieldCoverage(
  rawPlace: any,
  mappedResult: any,
  uiUsedKeys: readonly string[] = UI_USED_KEYS
): FieldCoverageItem {
  const googlePresent = GOOGLE_KEYS.filter((k) => hasGoogleKey(rawPlace, k));
  const dtoPresent = DTO_KEYS.filter((k) => hasDtoKey(mappedResult, k));
  const uiUsed = [...uiUsedKeys];
  const missingInDto = (DTO_KEYS as unknown as string[]).filter((k) => !dtoPresent.includes(k));
  const missingInUi = dtoPresent.filter((k) => !uiUsedKeys.includes(k));
  return {
    googlePresent,
    dtoPresent,
    uiUsed,
    missingInDto,
    missingInUi
  };
}

/**
 * Aggregate counts: for each key, how many items had it present.
 */
export function aggregateGoogleCounts(places: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of GOOGLE_KEYS) {
    counts[key] = places.filter((p) => hasGoogleKey(p, key)).length;
  }
  return counts;
}

export function aggregateDtoCounts(results: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of DTO_KEYS) {
    counts[key] = results.filter((r) => hasDtoKey(r, key)).length;
  }
  return counts;
}

/** First 8 chars of SHA1(placeId) for logging (no PII). */
export function placeIdHash(placeId: string | undefined): string {
  if (!placeId) return 'n/a';
  return createHash('sha1').update(placeId).digest('hex').slice(0, 8);
}

export interface CoverageReportPayload {
  requestId: string;
  traceId?: string;
  totals: {
    google: Record<string, number>;
    dto: Record<string, number>;
  };
  sample: Array<{
    name: string;
    placeIdHash: string;
    missingInDto: string[];
    missingInUi: string[];
  }>;
}

/**
 * Build the payload for the single "places_field_coverage" log event.
 * Pass up to 3 (rawPlace, mappedResult) pairs for sample items.
 */
export function buildCoverageReport(params: {
  requestId: string;
  traceId?: string;
  allRawPlaces: any[];
  allMappedResults: any[];
  samplePairs: Array<{ raw: any; mapped: any }>;
}): CoverageReportPayload {
  const { requestId, traceId, allRawPlaces, allMappedResults, samplePairs } = params;
  const totals = {
    google: aggregateGoogleCounts(allRawPlaces),
    dto: aggregateDtoCounts(allMappedResults)
  };
  const sample = samplePairs.slice(0, 3).map(({ raw, mapped }) => {
    const coverage = getFieldCoverage(raw, mapped);
    const placeId = mapped?.placeId ?? raw?.id ?? '';
    const idStr = typeof placeId === 'string' ? placeId : String(placeId);
    return {
      name: (mapped?.name ?? raw?.displayName?.text ?? '?').slice(0, 40),
      placeIdHash: placeIdHash(idStr.split('/').pop() ?? idStr),
      missingInDto: coverage.missingInDto,
      missingInUi: coverage.missingInUi
    };
  });
  return {
    requestId,
    traceId,
    totals,
    sample
  };
}
