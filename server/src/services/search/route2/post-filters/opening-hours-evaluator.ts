/**
 * Opening Hours Evaluator (PURE)
 * Pure functions for evaluating place opening hours
 * No I/O, no side effects - purely deterministic time calculations
 */

/**
 * Evaluate if place is open at specific time
 * Returns: true (open), false (closed), null (unknown/unparseable)
 */
export function evaluateOpenAt(place: any, openAt: any): boolean | null {
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
export function evaluateOpenBetween(place: any, openBetween: any): boolean | null {
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
 * Check if specific time is within any period (PURE helper)
 * Returns: true (open), false (closed), null (unknown)
 */
export function checkTimeInPeriods(periods: any[], day: number, minutes: number): boolean | null {
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
