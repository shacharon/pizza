/**
 * Production Environment Configuration
 * Use with: ng build --configuration=production
 */

const apiUrl = 'https://api.going2eat.food';
const wsBaseUrl = 'wss://api.going2eat.food';

// P1 Security: Fail build if localhost URLs accidentally used in production
if (apiUrl.includes('localhost') || wsBaseUrl.includes('localhost')) {
  throw new Error('[P1 Security] Production build must not use localhost URLs');
}

// P1 Security: Require HTTPS/WSS in production
if (!apiUrl.startsWith('https://') || !wsBaseUrl.startsWith('wss://')) {
  throw new Error('[P1 Security] Production must use HTTPS and WSS protocols');
}

export const environment = {
  production: true,
  apiUrl,
  apiBasePath: '/api/v1',
  wsBaseUrl,
  environmentName: 'prod',
  
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
