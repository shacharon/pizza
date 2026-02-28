import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER, isDevMode } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { httpTimeoutRetryInterceptor } from './core/interceptors/http-timeout-retry.interceptor';
import { httpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { apiSessionInterceptor } from './shared/http/api-session.interceptor';
import { FlagsApiClient } from './api/flags.api';
import { FlagsStore } from './state/flags.store';
import { SessionStore } from './state/session.store';
import { LanguageService } from './core/services/language.service';
import { AuthService } from './core/auth/auth.service';
import { provideServiceWorker } from '@angular/service-worker';

/**
 * Initialize feature flags from backend (GET /api/v1/flags).
 * On failure, API client returns safe defaults; we set whatever we get.
 */
function initializeFeatureFlags(flagsStore: FlagsStore, flagsApi: FlagsApiClient) {
  return async () => {
    const flags = await firstValueFrom(flagsApi.loadFlags());
    flagsStore.setFlags(flags);
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

/**
 * Sync SessionStore.locale from LanguageService (browser language) only on first load.
 * When session was loaded from storage, do not override saved user locale.
 * Skips setLocale when current locale already matches. No-op when not in browser (SSR-safe).
 */
function localeSyncInit(sessionStore: SessionStore, languageService: LanguageService) {
  return () => {
    if (typeof window === 'undefined' || !window.navigator) return;
    if (sessionStore.loadedFromStorage) return;
    const desired = languageService.currentLang();
    if (sessionStore.locale() === desired) return;
    sessionStore.setLocale(desired);
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
    {
      provide: APP_INITIALIZER,
      useFactory: localeSyncInit,
      deps: [SessionStore, LanguageService],
      multi: true
    },
    // Initialize feature flags from backend on startup
    {
      provide: APP_INITIALIZER,
      useFactory: initializeFeatureFlags,
      deps: [FlagsStore, FlagsApiClient],
      multi: true
    },
    provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};
