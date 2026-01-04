/**
 * Development Environment Configuration (AWS Dev)
 * Use with: ng serve --configuration=development
 */

export const environment = {
  production: false,
  apiUrl: 'http://food-alb-1712335919.eu-north-1.elb.amazonaws.com',
  apiBasePath: '/api/v1',
  environmentName: 'dev'
};
