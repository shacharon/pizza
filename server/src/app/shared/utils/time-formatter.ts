/**
 * Time Formatter Utility
 * Provides consistent time formatting across the application
 */

/**
 * Format closing time for display
 * Converts "00:00" to "24:00" for better UX (end of day)
 * 
 * @param time - Time string in format "HH:mm" or "HH:mm:ss"
 * @returns Formatted time string (UI-only, does not mutate source data)
 * 
 * @example
 * formatClosingTime("00:00") => "24:00"
 * formatClosingTime("00:00:00") => "24:00"
 * formatClosingTime("23:30") => "23:30"
 * formatClosingTime("12:00") => "12:00"
 */
export function formatClosingTime(time: string): string {
  if (!time) return time;
  
  // Check if time is "00:00" or "00:00:00" (midnight/end of day)
  if (time === '00:00' || time === '00:00:00') {
    return '24:00';
  }
  
  // Return original time (strip seconds if present)
  if (time.length > 5) {
    return time.substring(0, 5); // Convert "HH:mm:ss" to "HH:mm"
  }
  
  return time;
}

/**
 * Format time from Date object
 * Applies closing time formatting (00:00 → 24:00)
 * 
 * @param date - Date object
 * @returns Formatted time string "HH:mm"
 */
export function formatTimeFromDate(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;
  
  return formatClosingTime(time);
}

/**
 * Format time from raw time string (e.g., "2200" → "22:00")
 * Applies closing time formatting (00:00 → 24:00)
 * 
 * @param timeStr - Raw time string in format "HHmm"
 * @returns Formatted time string "HH:mm"
 */
export function formatTimeFromRaw(timeStr: string): string {
  if (!timeStr || timeStr.length < 4) return timeStr;
  
  const hours = timeStr.substring(0, 2);
  const minutes = timeStr.substring(2, 4);
  const time = `${hours}:${minutes}`;
  
  return formatClosingTime(time);
}
