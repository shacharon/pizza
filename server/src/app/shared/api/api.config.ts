/**
 * Central API Configuration
 * Single source of truth for all backend endpoints
 * 
 * Environment-based configuration:
 * - Local: http://localhost:3000/api/v1
 * - Dev: https://api.going2eat.food/api/v1
 * - Prod: https://api.going2eat.food/api/v1
 */

import { environment } from '../../../environments/environment';

/**
 * Resolve the full API base URL from environment configuration
 */
function resolveApiBase(): string {
  const { apiUrl, apiBasePath } = environment;
  return `${apiUrl}${apiBasePath}`;
}

/**
 * Canonical API base URL
 */
export const API_BASE = resolveApiBase();

/**
 * All backend endpoints (comprehensive)
 * MANDATORY: Use these constants in all services
 */
export const ENDPOINTS = {
  // Auth
  AUTH_TOKEN: `${API_BASE}/auth/token`,
  WS_TICKET: `${API_BASE}/ws-ticket`,
  
  // Search v1
  SEARCH: `${API_BASE}/search`,
  SEARCH_STATS: `${API_BASE}/search/stats`,
  
  // Analytics v1
  ANALYTICS_EVENTS: `${API_BASE}/analytics/events`,
  ANALYTICS_STATS: `${API_BASE}/analytics/stats`,
  
  // Dialogue v1
  DIALOGUE: `${API_BASE}/dialogue`,
  DIALOGUE_SESSION: (sessionId: string) => `${API_BASE}/dialogue/session/${sessionId}`,
  DIALOGUE_STATS: `${API_BASE}/dialogue/stats`,
  
  // Legacy endpoints (still mounted at /api/v1 via dual-mount)
  CHAT: `${API_BASE}/chat`,
  PLACES_SEARCH: `${API_BASE}/places/search`,
  
  // Future/Placeholder endpoints
  SESSION: `${API_BASE}/session`,
  SESSION_BY_ID: (sessionId: string) => `${API_BASE}/session/${sessionId}`,
  FLAGS: `${API_BASE}/flags`,
  ACTIONS: `${API_BASE}/actions`,
  ACTIONS_BY_ID: (actionId: string) => `${API_BASE}/actions/${actionId}`,
} as const;

/**
 * Build full API URL from path segment
 * ALWAYS returns absolute URL (never relative)
 * 
 * @param path - Path segment (e.g., "/search/req-123/result")
 * @returns Absolute URL (e.g., "https://api.going2eat.food/api/v1/search/req-123/result")
 * 
 * @example
 * buildApiUrl("/search/req-123/result")
 * // Returns: "https://api.going2eat.food/api/v1/search/req-123/result"
 */
export function buildApiUrl(path: string): string {
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Build absolute URL
  const absoluteUrl = `${API_BASE}${cleanPath}`;
  
  // DEV-ONLY: Guard against accidental relative URLs
  if (!environment.production && typeof window !== 'undefined') {
    if (absoluteUrl.startsWith(window.location.origin) && !absoluteUrl.includes(environment.apiUrl)) {
      console.error(
        `[API Config] ❌ CRITICAL: Detected relative URL construction!\n` +
        `URL: ${absoluteUrl}\n` +
        `Expected API origin: ${environment.apiUrl}\n` +
        `Current origin: ${window.location.origin}\n` +
        `This will cause CloudFront 301 redirects in production!`
      );
    }
  }
  
  return absoluteUrl;
}

/**
 * Check if a URL is an API request (PRODUCTION-SAFE)
 * Used by interceptors to determine if session headers should be added
 * 
 * IMPORTANT: Must correctly handle:
 * - Absolute URLs: https://api.domain.com/api/v1/search
 * - Edge case: malformed URLs should return false
 * 
 * @param url - Request URL to check
 * @returns true if URL is an API request (contains /api/)
 */
export function isApiRequest(url: string): boolean {
  try {
    // Parse URL (handles both relative and absolute)
    const urlObj = new URL(url, window.location.origin);
    const pathname = urlObj.pathname;
    
    // Check if pathname contains /api/
    return pathname.includes('/api/');
  } catch {
    // Malformed URL - assume not an API request
    return false;
  }
}

/**
 * Log configuration on app startup (for debugging)
 * DEV ONLY: Avoid logging in production
 */
if (typeof window !== 'undefined' && !environment.production) {
  console.log(`%c🌍 API Environment: ${environment.environmentName.toUpperCase()}`, 'color: #4CAF50; font-weight: bold; font-size: 14px;');
  console.log('[API Config] ✅ Initialized:', {
    environment: environment.environmentName,
    apiUrl: environment.apiUrl,
    fullBase: API_BASE,
    endpointCount: Object.keys(ENDPOINTS).filter(k => typeof ENDPOINTS[k as keyof typeof ENDPOINTS] !== 'function').length
  });
}
