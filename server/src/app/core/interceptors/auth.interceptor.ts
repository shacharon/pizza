/**
 * Authentication Interceptor
 * Attaches JWT Bearer token to all API requests
 * 
 * Behavior:
 * 1. Check if request is to API endpoint (isApiRequest)
 * 2. Check authMode from environment (dual vs cookie_only)
 * 3. If authMode = 'dual': Fetch JWT token and attach Authorization header
 * 4. If authMode = 'cookie_only': Skip JWT (cookie-only auth)
 * 5. On 401 INVALID_TOKEN: refresh token once and retry (dual mode only)
 * 
 * Order in chain:
 * - Auth interceptor runs FIRST (before session, retry, error)
 * - This ensures Authorization header is present for all API calls (dual mode)
 * 
 * Auth Mode:
 * - 'dual': JWT + cookies (default)
 * - 'cookie_only': Cookies only (JWT code disabled but not removed)
 */

import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { isApiRequest } from '../../shared/api/api.config';
import { from, switchMap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Auth interceptor function
 * Functional interceptor (Angular 19 standalone pattern)
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Skip non-API requests
  if (!isApiRequest(req.url)) {
    return next(req);
  }

  // Skip if Authorization header already present (manual override)
  if (req.headers.has('Authorization')) {
    return next(req);
  }

  // Skip auth endpoint itself (avoid circular dependency)
  if (req.url.includes('/auth/token')) {
    return next(req);
  }

  // COOKIE_ONLY MODE: Skip JWT attachment entirely
  if (environment.authMode === 'cookie_only') {
    console.debug('[Auth] AUTH_MODE=cookie_only - skipping JWT');
    return next(req);
  }

  // DUAL MODE: Attach JWT as before
  const authService = inject(AuthService);

  // Get token and attach to request
  return from(authService.getToken()).pipe(
    switchMap(token => {
      // Clone request with Authorization header
      const cloned = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      
      return next(cloned);
    }),
    catchError((error: unknown) => {
      // Handle 401 INVALID_TOKEN by refreshing token once
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const errorCode = (error.error as any)?.code;
        
        if (errorCode === 'INVALID_TOKEN') {
          console.log('[Auth] Received 401 INVALID_TOKEN, refreshing token...');
          
          // Refresh token and retry request once
          return from(authService.refreshToken()).pipe(
            switchMap(newToken => {
              const retried = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`
                }
              });
              
              console.log('[Auth] Retrying request with new token');
              return next(retried);
            }),
            catchError(refreshError => {
              console.error('[Auth] Token refresh failed', refreshError);
              return throwError(() => refreshError);
            })
          );
        }
      }
      
      // Re-throw other errors
      return throwError(() => error);
    })
  );
};
