/**
 * Production Environment Configuration
 * Use with: ng build --configuration=production
 */

export const environment = {
  production: true,
  apiUrl: 'https://api.going2eat.food',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'wss://api.going2eat.food',
  environmentName: 'prod'
};
