import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER, isDevMode } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { httpTimeoutRetryInterceptor } from './core/interceptors/http-timeout-retry.interceptor';
import { httpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { apiSessionInterceptor } from './shared/http/api-session.interceptor';
import { FlagsStore } from './state/flags.store';
import { AuthService } from './core/auth/auth.service';
import { provideServiceWorker } from '@angular/service-worker';

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

/**
 * Initialize session on app startup
 * Ensures valid sessionId exists BEFORE any WebSocket connections
 * 
 * CRITICAL: Prevents "WS subscribe requires valid sessionId" errors
 * - Fetches JWT token (which creates session if needed)
 * - Session ID is saved to localStorage
 * - WebSocket subscriptions can then use this sessionId
 */
function initializeSession(authService: AuthService) {
  return async () => {
    try {
      console.log('[AppInit] Initializing session...');
      await authService.getToken();
      console.log('[AppInit] ✅ Session initialized');
    } catch (error) {
      console.error('[AppInit] Failed to initialize session', error);
      // Don't block app startup on session failure
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([
      authInterceptor,                 // 1st: attach Authorization Bearer token (JWT)
      apiSessionInterceptor,           // 2nd: attach x-session-id (before retry/error)
      httpTimeoutRetryInterceptor,     // 3rd: timeout + retry (needs auth + session)
      httpErrorInterceptor             // 4th: error normalization (after retries exhausted)
    ])),
    provideRouter(routes),
    // Initialize session BEFORE any WebSocket connections (prevents anonymous subscribe)
    {
      provide: APP_INITIALIZER,
      useFactory: initializeSession,
      deps: [AuthService],
      multi: true
    },
    // Initialize feature flags on startup
    {
      provide: APP_INITIALIZER,
      useFactory: initializeFeatureFlags,
      deps: [FlagsStore],
      multi: true
    }, provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};
