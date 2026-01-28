/**
 * Post-Results Filter - Route2 Pipeline
 * 
 * Deterministic filtering applied after Google API results are received
 * Filters: openState (OPEN_NOW, CLOSED_NOW, null)
 * Hints: dietary preferences (SOFT hints, no removal)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { FinalSharedFilters, OpenState } from '../shared/shared-filters.types.js';
import { attachDietaryHints } from './dietary-hints.js';

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
    unknownKept: number;
    unknownRemoved: number;
  };
}

/**
 * Apply post-result filters to search results
 */
export function applyPostFilters(input: PostFilterInput): PostFilterOutput {
  const { results, sharedFilters, requestId, pipelineVersion } = input;

  const beforeCount = results.length;

  // Apply open/closed filter ONLY if explicitly requested
  const { filtered, unknownKept, unknownRemoved } = filterByOpenState(
    results,
    sharedFilters.openState,
    sharedFilters.openAt,
    sharedFilters.openBetween
  );
  const filteredResults = filtered;

  // Attach dietary hints (SOFT hints - no removal)
  const isGlutenFree = (sharedFilters as any).isGlutenFree ?? null;
  if (isGlutenFree === true) {
    for (const result of filteredResults) {
      attachDietaryHints(result, isGlutenFree);
    }
  }

  const afterCount = filteredResults.length;

  // Note: Timing/logging owned by orchestrator (startStage/endStage)
  // This function only returns data for orchestrator to log

  return {
    resultsFiltered: filteredResults,
    applied: {
      openState: sharedFilters.openState
    },
    stats: {
      before: beforeCount,
      after: afterCount,
      removed: beforeCount - afterCount,
      unknownKept,
      unknownRemoved
    }
  };
}

/**
 * Filter results by open/closed state
 *
 * Rules:
 * - null: no filtering
 * - OPEN_NOW: keep openNow === true, KEEP unknown (default policy)
 * - CLOSED_NOW: keep openNow === false, KEEP unknown (default policy)
 * - OPEN_AT / OPEN_BETWEEN: evaluate structured opening hours, KEEP unknown
 * - Unknown policy: KEEP by default (better UX than removing all results)
 */
function filterByOpenState(
  results: any[],
  openState: OpenState,
  openAt: any,
  openBetween: any
): { filtered: any[]; unknownKept: number; unknownRemoved: number } {
  if (openState == null) {
    return { filtered: results, unknownKept: 0, unknownRemoved: 0 };
  }

  let unknownKept = 0;
  let unknownRemoved = 0;

  if (openState === 'OPEN_NOW') {
    const filtered = results.filter(place => {
      const openNow = place.openNow ?? place.currentOpeningHours?.openNow;
      
      // Explicit status: apply filter
      if (openNow === true) {
        return true; // KEEP open places
      }
      if (openNow === false) {
        return false; // REMOVE closed places
      }
      
      // Unknown status: KEEP by default (better UX)
      if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
        unknownKept++;
        return true; // KEEP unknown
      }
      
      return false;
    });
    return { filtered, unknownKept, unknownRemoved };
  }

  if (openState === 'CLOSED_NOW') {
    const filtered = results.filter(place => {
      const openNow = place.openNow ?? place.currentOpeningHours?.openNow;
      
      // Explicit status: apply filter
      if (openNow === false) {
        return true; // KEEP closed places
      }
      if (openNow === true) {
        return false; // REMOVE open places
      }
      
      // Unknown status: KEEP by default
      if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
        unknownKept++;
        return true; // KEEP unknown
      }
      
      return false;
    });
    return { filtered, unknownKept, unknownRemoved };
  }

  if (openState === 'OPEN_AT' && openAt) {
    const filtered = results.filter(place => {
      const isOpen = evaluateOpenAt(place, openAt);
      
      // Explicit evaluation result
      if (isOpen === true) {
        return true;
      }
      if (isOpen === false) {
        return false;
      }
      
      // Unknown/unparseable: KEEP by default
      if (isOpen === null) {
        unknownKept++;
        return true; // KEEP unknown
      }
      
      return false;
    });
    return { filtered, unknownKept, unknownRemoved };
  }

  if (openState === 'OPEN_BETWEEN' && openBetween) {
    const filtered = results.filter(place => {
      const isOpen = evaluateOpenBetween(place, openBetween);
      
      // Explicit evaluation result
      if (isOpen === true) {
        return true;
      }
      if (isOpen === false) {
        return false;
      }
      
      // Unknown/unparseable: KEEP by default
      if (isOpen === null) {
        unknownKept++;
        return true; // KEEP unknown
      }
      
      return false;
    });
    return { filtered, unknownKept, unknownRemoved };
  }

  return { filtered: results, unknownKept: 0, unknownRemoved: 0 };
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
