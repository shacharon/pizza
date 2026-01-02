/**
 * Central API Configuration
 * Single source of truth for all backend endpoints
 * 
 * Runtime override support:
 * - Set window.__API_BASE_URL__ in index.html for AWS/CDN deployments
 * - Default: /api/v1 (canonical)
 */

declare global {
  interface Window {
    __API_BASE_URL__?: string;
  }
}

/**
 * Resolve the API base URL from runtime override or default
 */
function resolveApiBase(): string {
  // Check for runtime override (set in index.html via <script> tag)
  if (typeof window !== 'undefined' && window.__API_BASE_URL__) {
    const runtimeBase = window.__API_BASE_URL__.replace(/\/$/, '');
    
    // MANDATORY: Warn if using legacy /api without version
    if (runtimeBase === '/api' || runtimeBase.endsWith('/api')) {
      console.warn(
        '[API Config] ⚠️ Runtime base uses legacy /api path without version. ' +
        'Please migrate to /api/v1. Legacy support will be removed soon.'
      );
    }
    
    return runtimeBase;
  }
  
  // Default to canonical /api/v1
  return '/api/v1';
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
 * Check if a URL is an API request (PRODUCTION-SAFE)
 * Used by interceptors to determine if session headers should be added
 * 
 * IMPORTANT: Must correctly handle:
 * - Relative URLs: /api/v1/search
 * - Absolute URLs: https://api.domain.com/api/v1/search
 * - Edge case: malformed URLs should return false
 * 
 * @param url - Request URL to check
 * @returns true if URL is an API request (starts with /api/)
 */
export function isApiRequest(url: string): boolean {
  try {
    // Parse URL (handles both relative and absolute)
    const urlObj = new URL(url, window.location.origin);
    const pathname = urlObj.pathname;
    
    // Check if pathname starts with /api/
    // Using startsWith (NOT includes) to match actual API routes only
    return pathname.startsWith('/api/');
  } catch {
    // Malformed URL - assume not an API request
    return false;
  }
}

/**
 * Log configuration on app startup (for debugging)
 * DEV ONLY: Avoid logging in production
 */
if (typeof window !== 'undefined') {
  console.log('[API Config] ✅ Initialized:', {
    base: API_BASE,
    runtimeOverride: window.__API_BASE_URL__ || 'none',
    endpointCount: Object.keys(ENDPOINTS).filter(k => typeof ENDPOINTS[k as keyof typeof ENDPOINTS] !== 'function').length
  });
}
