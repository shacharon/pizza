/**
 * Default Environment Configuration (Local Development)
 * This file is used when running `ng serve` without any configuration flag
 */

export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'ws://localhost:3000', // Phase 6: WebSocket endpoint
  environmentName: 'local',
  features: {
    asyncSearch: true, // Phase 6: Enable async mode by default
  }
};
