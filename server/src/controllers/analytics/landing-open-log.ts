/** Same shape the UI uses for a tracked link: `qr` or `p:<name>` (from /q and /p/<name>). */
const ENTRY_PATTERN = /^(qr|p:[a-z0-9][a-z0-9-]{0,23})$/;

export interface LandingOpenLog {
  event: 'landing_open';
  entry: string;
  sessionPrefix: string;
}

/** Fields safe to keep in CloudWatch. Drops the raw session. */
export function landingOpenLog(
  event: unknown,
  data: unknown,
  sessionId: string | undefined
): LandingOpenLog | null {
  if (event !== 'landing_open' || !data || typeof data !== 'object') return null;
  const entry = String((data as Record<string, unknown>).entry || '');
  if (!ENTRY_PATTERN.test(entry)) return null;
  const sessionPrefix = String(sessionId || '')
    .replace(/^sess_/, '')
    .slice(0, 8);
  return { event: 'landing_open', entry, sessionPrefix };
}
