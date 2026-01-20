/**
 * Post-Results Filter - Route2 Pipeline
 * 
 * Deterministic filtering applied after Google API results are received
 * Filters: openState (OPEN_NOW, CLOSED_NOW, null)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { FinalSharedFilters, OpenState } from '../shared/shared-filters.types.js';

export interface PostFilterInput {
  results: any[]; // PlaceResult[] from Google Maps stage
  sharedFilters: FinalSharedFilters;
  requestId: string;
  pipelineVersion: 'route2';
}

export interface PostFilterOutput {
  resultsFiltered: any[];
  applied: {
    openState: OpenState;
  };
  stats: {
    before: number;
    after: number;
    removed: number;
    unknownExcluded: number;
  };
}

/**
 * Apply post-result filters to search results
 */
export function applyPostFilters(input: PostFilterInput): PostFilterOutput {
  const { results, sharedFilters, requestId, pipelineVersion } = input;
  const startTime = Date.now();

  const beforeCount = results.length;
  let unknownExcluded = 0;

  // Apply open/closed filter ONLY if explicitly requested
  const { filtered, unknownCount } = filterByOpenState(
    results,
    sharedFilters.openState,
    sharedFilters.openAt,
    sharedFilters.openBetween
  );
  const filteredResults = filtered;
  unknownExcluded = unknownCount;

  const afterCount = filteredResults.length;
  const durationMs = Date.now() - startTime;

  logger.info({
    requestId,
    pipelineVersion,
    stage: 'post_filter',
    event: 'stage_completed',
    durationMs,
    openState: sharedFilters.openState,
    openAt: sharedFilters.openAt,
    openBetween: sharedFilters.openBetween,
    stats: {
      before: beforeCount,
      after: afterCount,
      removed: beforeCount - afterCount,
      unknownExcluded
    }
  }, '[ROUTE2] post_filter completed');

  return {
    resultsFiltered: filteredResults,
    applied: {
      openState: sharedFilters.openState
    },
    stats: {
      before: beforeCount,
      after: afterCount,
      removed: beforeCount - afterCount,
      unknownExcluded
    }
  };
}

/**
 * Filter results by open/closed state
 *
 * Rules:
 * - null: no filtering
 * - OPEN_NOW: keep only openNow === true
 * - CLOSED_NOW: keep only openNow === false
 * - OPEN_AT / OPEN_BETWEEN: evaluate structured opening hours
 * - Missing/unparseable data: exclude (defensive)
 */
function filterByOpenState(
  results: any[],
  openState: OpenState,
  openAt: any,
  openBetween: any
): { filtered: any[]; unknownCount: number } {
  if (openState == null) {
    return { filtered: results, unknownCount: 0 };
  }

  let unknownCount = 0;

  if (openState === 'OPEN_NOW') {
    const filtered = results.filter(place => {
      const openNow = place.openNow ?? place.currentOpeningHours?.openNow;
      if (openNow === undefined || openNow === null) {
        unknownCount++;
        return false; // exclude UNKNOWN
      }
      return openNow === true;
    });
    return { filtered, unknownCount };
  }

  if (openState === 'CLOSED_NOW') {
    const filtered = results.filter(place => {
      const openNow = place.openNow ?? place.currentOpeningHours?.openNow;
      if (openNow === undefined || openNow === null) {
        unknownCount++;
        return false; // exclude UNKNOWN
      }
      return openNow === false;
    });
    return { filtered, unknownCount };
  }

  if (openState === 'OPEN_AT' && openAt) {
    const filtered = results.filter(place => {
      const isOpen = evaluateOpenAt(place, openAt);
      if (isOpen === null) {
        unknownCount++;
        return false; // exclude UNKNOWN
      }
      return isOpen;
    });
    return { filtered, unknownCount };
  }

  if (openState === 'OPEN_BETWEEN' && openBetween) {
    const filtered = results.filter(place => {
      const isOpen = evaluateOpenBetween(place, openBetween);
      if (isOpen === null) {
        unknownCount++;
        return false; // exclude UNKNOWN
      }
      return isOpen;
    });
    return { filtered, unknownCount };
  }

  return { filtered: results, unknownCount };
}

/**
 * Evaluate if place is open at specific time
 * Returns: true (open), false (closed), null (unknown/unparseable)
 */
function evaluateOpenAt(place: any, openAt: any): boolean | null {
  const periods = place.currentOpeningHours?.periods || place.regularOpeningHours?.periods;

  if (!periods || !Array.isArray(periods)) {
    return null; // No structured data
  }

  // openAt fields are now nullable - check for null explicitly
  const targetDay = (openAt.day !== null && openAt.day !== undefined) ? openAt.day : new Date().getDay(); // 0=Sunday
  const targetTime = openAt.timeHHmm;

  if (!targetTime || targetTime === null) {
    return null;
  }

  // Convert time to minutes since midnight
  const [hours, minutes] = targetTime.split(':').map(Number);
  const targetMinutes = hours * 60 + minutes;

  // Check if any period covers this time on this day
  for (const period of periods) {
    if (!period.open) continue;

    const openDay = period.open.day;
    const closeDay = period.close?.day;

    // Check if target day matches
    if (openDay !== targetDay) continue;

    const openHour = period.open.hour ?? 0;
    const openMinute = period.open.minute ?? 0;
    const openMinutes = openHour * 60 + openMinute;

    const closeHour = period.close?.hour ?? 23;
    const closeMinute = period.close?.minute ?? 59;
    const closeMinutes = closeHour * 60 + closeMinute;

    // Check if target time is within this period
    if (closeDay === openDay) {
      // Same day opening
      if (targetMinutes >= openMinutes && targetMinutes < closeMinutes) {
        return true;
      }
    } else {
      // Crosses midnight
      if (targetMinutes >= openMinutes || (closeDay === targetDay && targetMinutes < closeMinutes)) {
        return true;
      }
    }
  }

  return false; // Not open at this time
}

/**
 * Evaluate if place is open during time range
 * Returns: true (open during range), false (closed), null (unknown)
 */
function evaluateOpenBetween(place: any, openBetween: any): boolean | null {
  const periods = place.currentOpeningHours?.periods || place.regularOpeningHours?.periods;

  if (!periods || !Array.isArray(periods)) {
    return null;
  }

  // openBetween fields are now nullable - check for null explicitly
  const targetDay = (openBetween.day !== null && openBetween.day !== undefined) ? openBetween.day : new Date().getDay();
  const startTime = openBetween.startHHmm;
  const endTime = openBetween.endHHmm;

  if (!startTime || startTime === null || !endTime || endTime === null) {
    return null;
  }

  // Convert times to minutes
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  const rangeStart = startHours * 60 + startMinutes;
  const rangeEnd = endHours * 60 + endMinutes;

  // Check if place is open for the ENTIRE requested range
  // For simplicity: check if place is open at start AND end time
  const openAtStart = checkTimeInPeriods(periods, targetDay, rangeStart);
  const openAtEnd = checkTimeInPeriods(periods, targetDay, rangeEnd);

  if (openAtStart === null || openAtEnd === null) {
    return null;
  }

  return openAtStart && openAtEnd;
}

/**
 * Helper: Check if specific time is within any period
 */
function checkTimeInPeriods(periods: any[], day: number, minutes: number): boolean | null {
  for (const period of periods) {
    if (!period.open) continue;

    const openDay = period.open.day;
    if (openDay !== day) continue;

    const openHour = period.open.hour ?? 0;
    const openMinute = period.open.minute ?? 0;
    const openMinutes = openHour * 60 + openMinute;

    const closeHour = period.close?.hour ?? 23;
    const closeMinute = period.close?.minute ?? 59;
    const closeMinutes = closeHour * 60 + closeMinute;

    if (minutes >= openMinutes && minutes < closeMinutes) {
      return true;
    }
  }

  return false;
}
