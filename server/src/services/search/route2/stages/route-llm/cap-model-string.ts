/** Model textQuery sent toward Google, in JavaScript string length. */
export const MODEL_TEXT_QUERY_MAX_CHARS = 80;

/** Model cityText, in JavaScript string length. */
export const MODEL_CITY_TEXT_MAX_CHARS = 40;

/**
 * Shorten a model string on a word boundary.
 * A value at or under the cap is returned trimmed.
 * A longer value is cut at the last space inside the cap.
 * A single token with no space inside the cap is cut at maxChars.
 */
export function capModelString(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  const head = trimmed.slice(0, maxChars);
  const breakAt = head.lastIndexOf(' ');
  if (breakAt <= 0) {
    return head;
  }
  return head.slice(0, breakAt).trimEnd();
}
