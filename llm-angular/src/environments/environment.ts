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
  features: {
    useSseAssistant: true  // Use SSE for assistant instead of WebSocket
  }
};
