import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { httpTimeoutRetryInterceptor } from './core/interceptors/http-timeout-retry.interceptor';
import { httpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { FlagsStore } from './state/flags.store';

/**
 * Initialize feature flags on app startup
 * Enables unified search by default in development
 */
function initializeFeatureFlags(flagsStore: FlagsStore) {
  return () => {
    // Enable unified search for development
    flagsStore.setFlag('unifiedSearch', true);
    console.log('[FeatureFlags] ✅ unifiedSearch enabled');
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([httpTimeoutRetryInterceptor, httpErrorInterceptor])),
    provideRouter(routes),
    // Initialize feature flags on startup
    {
      provide: APP_INITIALIZER,
      useFactory: initializeFeatureFlags,
      deps: [FlagsStore],
      multi: true
    }
  ]
};
