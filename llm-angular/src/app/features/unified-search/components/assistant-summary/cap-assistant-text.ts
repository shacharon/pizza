/** Max characters shown for one assistant reply field. */
export const ASSISTANT_REPLY_MAX_CHARS = 600;

/** Cut a reply at 600 characters. A shorter string is returned unchanged. */
export function capAssistantText(text: string): string {
  if (text.length <= ASSISTANT_REPLY_MAX_CHARS) return text;
  return text.slice(0, ASSISTANT_REPLY_MAX_CHARS);
}
