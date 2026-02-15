/**
 * Development Environment Configuration (AWS Dev)
 * Use with: ng serve --configuration=development
 */

export const environment = {
  production: false,
  apiUrl: 'https://api.going2eat.food',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'wss://api.going2eat.food',
  environmentName: 'dev',
  
  /**
   * Authentication Mode
   * - 'dual': Send both JWT (Authorization header) + session cookies (default)
   * - 'cookie_only': Send only session cookies (no JWT, no x-session-id)
   */
  authMode: 'dual' as 'dual' | 'cookie_only',
  
  features: {
    useSseAssistant: true  // Use SSE for assistant instead of WebSocket
  }
};
