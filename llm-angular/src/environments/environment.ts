/**
 * Default Environment Configuration (Local Development)
 * This file is used when running `ng serve` without any configuration flag
 */

export const environment = {
  production: false,
  apiUrl: '',  // Empty = same origin (uses Angular proxy in dev)
  apiBasePath: '/api/v1',
  wsBaseUrl: 'ws://localhost:4200',  // WS also goes through proxy
  environmentName: 'local',
  
  /**
   * Authentication Mode
   * - 'dual': Send both JWT (Authorization header) + session cookies (default)
   * - 'cookie_only': Send only session cookies (no JWT, no x-session-id)
   * 
   * Use 'cookie_only' to test pure server-authoritative session flow.
   * JWT code remains intact but disabled when authMode = 'cookie_only'.
   */
  authMode: 'dual' as 'dual' | 'cookie_only',
  
  features: {
    useSseAssistant: true  // Use SSE for assistant instead of WebSocket
  }
};
