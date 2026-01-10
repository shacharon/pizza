/**
 * Development Environment Configuration (AWS Dev)
 * Use with: ng serve --configuration=development
 */

export const environment = {
  production: false,
  apiUrl: 'https://api.going2eat.food',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'wss://api.going2eat.food', // Phase 6: WebSocket endpoint
  environmentName: 'dev',
  features: {
    asyncSearch: true, // Phase 6: Enable async mode
  }
};
