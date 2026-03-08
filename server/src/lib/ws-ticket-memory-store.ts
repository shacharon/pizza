/**
 * In-memory WebSocket ticket store (fallback when Redis is down).
 * Single-instance / dev only; tickets are one-time use and short TTL.
 */

interface TicketEntry {
  userId: string | null;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
}

const store = new Map<string, TicketEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const TTL_MS = 60_000; // 60s
const CLEANUP_INTERVAL_MS = 30_000;

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

/**
 * Store a one-time ticket (when Redis is down).
 */
export function setTicket(ticket: string, data: { userId?: string | null; sessionId: string; createdAt: number }, ttlSeconds: number = 60): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  store.set(ticket, {
    userId: data.userId ?? null,
    sessionId: data.sessionId,
    createdAt: data.createdAt,
    expiresAt
  });
  ensureCleanup();
}

/**
 * Get and delete ticket (one-time use). Returns payload or null if missing/expired.
 */
export function getAndDeleteTicket(ticket: string): { userId?: string | null; sessionId: string; createdAt: number } | null {
  const entry = store.get(ticket);
  store.delete(ticket);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return {
    userId: entry.userId,
    sessionId: entry.sessionId,
    createdAt: entry.createdAt
  };
}
