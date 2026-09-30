const ACTIONS = new Set(['open', 'navigate', 'call', 'wolt', 'tenbis', 'mishloha']);

export interface ResultActionLog {
  event: 'result_action';
  action: string;
  name: string;
  requestId: string;
  sessionPrefix: string;
}

/** Fields safe to keep in CloudWatch. Drops the raw session, phone, and URL. */
export function resultActionLog(
  event: unknown,
  data: unknown,
  sessionId: string | undefined
): ResultActionLog | null {
  if (event !== 'result_action' || !data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  const action = String(body.action || '');
  if (!ACTIONS.has(action)) return null;
  const name = String(body.name || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!name) return null;
  const requestId = /^req-[A-Za-z0-9-]{6,80}$/.test(String(body.requestId || ''))
    ? String(body.requestId)
    : '';
  const sessionPrefix = String(sessionId || '')
    .replace(/^sess_/, '')
    .slice(0, 8);
  return {
    event: 'result_action',
    action,
    name,
    requestId,
    sessionPrefix
  };
}
