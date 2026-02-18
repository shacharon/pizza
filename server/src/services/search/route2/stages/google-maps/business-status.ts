/**
 * Google Places business_status handling
 * Filter out CLOSED_PERMANENTLY everywhere; keep CLOSED_TEMPORARILY with flag; treat missing as OPERATIONAL.
 */

/** Google Place (raw API) with optional businessStatus */
export type PlaceWithBusinessStatus = { id?: string; businessStatus?: string; [k: string]: unknown };

/** DTO result that may have businessStatus (for cache read filtering) */
export type ResultWithBusinessStatus = { placeId?: string; businessStatus?: string; [k: string]: unknown };

/**
 * Operational = OPERATIONAL or missing (treat missing as operational, do not filter).
 */
export function isOperational(place: PlaceWithBusinessStatus): boolean {
  const s = place.businessStatus;
  return s === undefined || s === '' || s === 'OPERATIONAL';
}

/**
 * Permanently closed → must never be returned to client.
 */
export function isPermanentlyClosed(place: PlaceWithBusinessStatus): boolean {
  return place.businessStatus === 'CLOSED_PERMANENTLY';
}

/**
 * Temporarily closed → keep but mark in DTO for UI.
 */
export function isTemporarilyClosed(place: PlaceWithBusinessStatus): boolean {
  return place.businessStatus === 'CLOSED_TEMPORARILY';
}

/**
 * Extract place ID from Google Place (id may be "places/ChIJ...").
 */
function getPlaceId(place: PlaceWithBusinessStatus): string {
  const raw = place.id ?? 'unknown';
  return typeof raw === 'string' && raw.includes('/') ? raw.split('/').pop() ?? raw : String(raw);
}

/**
 * Filter raw places: remove CLOSED_PERMANENTLY before mapping/caching.
 * Returns only places that are operational or temporarily closed.
 * Caller should log metrics via logBusinessStatusMetrics().
 */
export function filterPlacesByBusinessStatus(places: PlaceWithBusinessStatus[]): {
  filtered: PlaceWithBusinessStatus[];
  permanentlyClosedCount: number;
  permanentlyClosedPlaceIds: string[];
  tempClosedCount: number;
  missingStatusCount: number;
} {
  let permanentlyClosedCount = 0;
  const permanentlyClosedPlaceIds: string[] = [];
  let tempClosedCount = 0;
  let missingStatusCount = 0;
  const filtered: PlaceWithBusinessStatus[] = [];

  for (const place of places) {
    if (isPermanentlyClosed(place)) {
      permanentlyClosedCount++;
      permanentlyClosedPlaceIds.push(getPlaceId(place));
      continue;
    }
    if (isTemporarilyClosed(place)) {
      tempClosedCount++;
    } else if (place.businessStatus === undefined || place.businessStatus === '') {
      missingStatusCount++;
    }
    filtered.push(place);
  }

  return { filtered, permanentlyClosedCount, permanentlyClosedPlaceIds, tempClosedCount, missingStatusCount };
}

/**
 * Filter already-mapped results (e.g. from cache): remove any with businessStatus CLOSED_PERMANENTLY.
 * Use when reading from cache to exclude stale permanently-closed entries.
 */
export function filterResultsByBusinessStatus<T extends ResultWithBusinessStatus>(results: T[]): T[] {
  return results.filter((r) => r.businessStatus !== 'CLOSED_PERMANENTLY');
}

export interface LogBusinessStatusMetricsParams {
  requestId: string;
  permanentlyClosedCount: number;
  tempClosedCount: number;
  missingStatusCount: number;
  placeIdsFiltered?: string[];
  logger: { info: (obj: object, msg?: string) => void; debug: (obj: object, msg?: string) => void };
}

/**
 * Log metrics for business status filtering.
 * Counts at info level (for metrics); requestId + placeId detail at debug only.
 */
export function logBusinessStatusMetrics(params: LogBusinessStatusMetricsParams): void {
  const { requestId, permanentlyClosedCount, tempClosedCount, missingStatusCount, placeIdsFiltered, logger } = params;
  if (permanentlyClosedCount > 0) {
    logger.info(
      { requestId, event: 'google_places_filtered_permanently_closed', count: permanentlyClosedCount },
      '[GOOGLE] Filtered permanently closed places'
    );
    if (placeIdsFiltered?.length) {
      logger.debug(
        { requestId, event: 'google_places_filtered_permanently_closed_detail', placeIds: placeIdsFiltered },
        '[GOOGLE] Permanently closed placeIds (debug)'
      );
    }
  }
  if (tempClosedCount > 0) {
    logger.info(
      { requestId, event: 'google_places_temp_closed_count', count: tempClosedCount },
      '[GOOGLE] Places marked as temporarily closed'
    );
  }
  if (missingStatusCount > 0) {
    logger.debug(
      { requestId, event: 'google_places_business_status_missing', count: missingStatusCount },
      '[GOOGLE] Places with missing business_status (treated as OPERATIONAL)'
    );
  }
}
