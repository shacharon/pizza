/**
 * API Session Interceptor
 * Automatically attaches x-session-id header to all API requests
 * 
 * Session Semantics:
 * - x-session-id = stable browser session for correlation (analytics + debugging)
 * - NOT dialogue "conversation state" (backend manages that separately)
 * - Format: sess_<uuid>
 * - Stored in localStorage for browser stability
 * 
 * Auth Mode:
 * - 'dual': Attach x-session-id + withCredentials (default)
 * - 'cookie_only': Only withCredentials (no x-session-id header)
 */

import { HttpInterceptorFn } from '@angular/common/http';
import { isApiRequest } from '../api/api.config';
import { environment } from '../../../environments/environment';

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
 * - ALWAYS include withCredentials: true (enables HttpOnly cookie auth)
 * - If authMode = 'cookie_only': Skip x-session-id header (cookies only)
 */
export const apiSessionInterceptor: HttpInterceptorFn = (req, next) => {
  // Only intercept API requests
  if (!isApiRequest(req.url)) {
    return next(req);
  }
  
  // Skip if session header already present (explicit override)
  if (req.headers.has('x-session-id')) {
    // Still ensure withCredentials is set
    const withCreds = req.clone({ withCredentials: true });
    return next(withCreds);
  }
  
  // COOKIE_ONLY MODE: Only set withCredentials, no x-session-id header
  if (environment.authMode === 'cookie_only') {
    console.debug('[Session] AUTH_MODE=cookie_only - skipping x-session-id header');
    const cloned = req.clone({
      withCredentials: true // Still send cookies
    });
    return next(cloned);
  }
  
  // DUAL MODE: Attach session ID + enable credentials
  const sessionId = getSessionId();
  const cloned = req.clone({
    setHeaders: {
      'x-session-id': sessionId
    },
    withCredentials: true // CRITICAL: enables HttpOnly session cookies
  });
  
  return next(cloned);
};
