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
  features: {
    useSseAssistant: true  // Use SSE for assistant instead of WebSocket
  }
};
