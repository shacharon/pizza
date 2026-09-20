/**
 * Decide CloudWatch-facing HTTP log level.
 * Internet scanners (/, phpunit, .env) were ~94% of /ecs/food-backend warns.
 * Real API 4xx/5xx still surface; junk 404s do not.
 */

export type HttpLogLevel = 'error' | 'warn' | 'info' | 'debug';
export type HttpLogAction = { level: HttpLogLevel; skip: boolean };

const APP_PATH_PREFIXES = [
  '/api',
  '/search',
  '/auth',
  '/session',
  '/ws-ticket',
  '/stream',
  '/photos',
  '/healthz',
  '/health',
] as const;

/** Stale anonymous JWT on these paths is expected; do not warn. */
const AUTH_NOISE_PATHS = ['/ws-ticket', '/session', '/auth', '/token'] as const;

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function pathnames(path: string, originalUrl?: string): string[] {
  return [path, originalUrl ?? ''].map((p) => p.split('?')[0] ?? '');
}

export function isApplicationHttpPath(path: string, originalUrl?: string): boolean {
  return pathnames(path, originalUrl).some((p) =>
    APP_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(p, prefix))
  );
}

function isAuthNoisePath(path: string, originalUrl?: string): boolean {
  return pathnames(path, originalUrl).some((p) =>
    AUTH_NOISE_PATHS.some((prefix) => pathMatchesPrefix(p, prefix) || p.endsWith(prefix))
  );
}

/**
 * Bare `/` is not an application path. `/api/v1/search` is.
 */
export function resolveHttpResponseLog(params: {
  path: string;
  originalUrl?: string;
  statusCode: number;
  durationMs: number;
  slowThresholdMs: number;
}): HttpLogAction {
  const { path, originalUrl, statusCode, durationMs, slowThresholdMs } = params;
  const appPath = isApplicationHttpPath(path, originalUrl);
  const isSlow = durationMs > slowThresholdMs;

  if (statusCode >= 500) {
    return { level: 'error', skip: false };
  }

  if (!appPath && statusCode >= 400 && statusCode < 500) {
    return { level: 'debug', skip: true };
  }

  if (statusCode === 401 && isAuthNoisePath(path, originalUrl)) {
    return { level: 'debug', skip: true };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return { level: 'warn', skip: false };
  }

  if (isSlow) {
    return { level: 'info', skip: false };
  }

  return { level: 'debug', skip: false };
}

export function isExpiredTokenError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const lower = msg.toLowerCase();
  return lower.includes('jwt expired') || lower.includes('token expired');
}
