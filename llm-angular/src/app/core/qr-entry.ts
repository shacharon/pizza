const ENTRY_KEY = 'g2eEntry';
const ENTRY_PATTERN = /^(qr|p:[a-z0-9][a-z0-9-]{0,23})$/;

/** Remember which tracked link this tab opened, for the search report. */
export function rememberSearchEntry(entry: string): void {
  if (!ENTRY_PATTERN.test(entry)) return;
  try {
    sessionStorage.setItem(ENTRY_KEY, entry);
  } catch {
    /* private mode */
  }
}

/** `/p/cafe` becomes `p:cafe`. Anything else is ignored. */
export function entryFromPrefix(prefix: string | null | undefined): string | undefined {
  const cleaned = (prefix || '').trim().toLowerCase();
  const entry = `p:${cleaned}`;
  return ENTRY_PATTERN.test(entry) ? entry : undefined;
}

/** Sent with each search so the report can list this link's queries. */
export function currentSearchEntry(): string | undefined {
  try {
    const value = sessionStorage.getItem(ENTRY_KEY) || '';
    return ENTRY_PATTERN.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
