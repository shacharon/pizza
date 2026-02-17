/**
 * API Session Interceptor
 * Automatically attaches x-session-id header to all API requests
 * 
 * Session Semantics:
 * - x-session-id = stable browser session for correlation (analytics + debugging)
 * - NOT dialogue "conversation state" (backend manages that separately)
 * - Format: sess_<uuid>
 * - Stored in localStorage for browser stability
 */

import { HttpInterceptorFn } from '@angular/common/http';
import { isApiRequest } from '../api/api.config';

const SESSION_STORAGE_KEY = 'api-session-id';

/**
 * Generate a stable session ID in format: sess_<uuid>
 */
function generateSessionId(): string {
  const uuid = crypto.randomUUID();
  return `sess_${uuid}`;
}

/**
 * Get or create session ID from localStorage
 */
function getSessionId(): string {
  try {
    let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);

    if (!sessionId) {
      sessionId = generateSessionId();
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      console.log('[Session] Generated new session ID:', sessionId.substring(0, 20) + '...');
    }

    return sessionId;
  } catch (error) {
    // Fallback if localStorage is unavailable (e.g., private browsing)
    console.warn('[Session] localStorage unavailable, using ephemeral session');
    return generateSessionId();
  }
}

/**
 * Interceptor function to attach session ID to API requests
 * 
 * Rules:
 * - Only apply to API requests (isApiRequest check)
 * - DO NOT overwrite explicit x-session-id header (manual override)
 */
export const apiSessionInterceptor: HttpInterceptorFn = (req, next) => {
  // רק API
  if (!isApiRequest(req.url)) return next(req);

  // 🔥 אל תוסיף X-Session-Id לאנדפוינטים של auth
  if (req.url.includes('/api/v1/auth/')) {
    const cleaned = req.clone({
      headers: req.headers.delete('X-Session-Id')
    });
    return next(cleaned);
  }

  // רגיל
  const sessionId = (() => {
    try { return localStorage.getItem(SESSION_STORAGE_KEY) || ''; } catch { return ''; }
  })();

  if (!sessionId) return next(req);

  return next(req.clone({
    setHeaders: { 'X-Session-Id': sessionId }
  }));
};
