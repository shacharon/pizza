/**
 * Default Environment Configuration (Local Development)
 * This file is used when running `ng serve` without any configuration flag
 */

export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'ws://localhost:3000',
  environmentName: 'local'
};
