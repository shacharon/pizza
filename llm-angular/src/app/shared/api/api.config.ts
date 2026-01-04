/**
 * Central API Configuration
 * Single source of truth for all backend endpoints
 * 
 * Environment-based configuration:
 * - Local: http://localhost:3000/api/v1
 * - Dev: http://food-alb-1712335919.eu-north-1.elb.amazonaws.com/api/v1
 * - Prod: https://api.yourdomain.com/api/v1
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
if (typeof window !== 'undefined' && !environment.production) {
  console.log(`%c🌍 API Environment: ${environment.environmentName.toUpperCase()}`, 'color: #4CAF50; font-weight: bold; font-size: 14px;');
  console.log('[API Config] ✅ Initialized:', {
    environment: environment.environmentName,
    apiUrl: environment.apiUrl,
    fullBase: API_BASE,
    endpointCount: Object.keys(ENDPOINTS).filter(k => typeof ENDPOINTS[k as keyof typeof ENDPOINTS] !== 'function').length
  });
}
