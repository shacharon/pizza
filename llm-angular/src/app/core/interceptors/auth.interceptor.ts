import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { isApiRequest } from '../../shared/api/api.config';
import { from, switchMap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {

  if (!isApiRequest(req.url)) {
    return next(req);
  }

  // 🔥 חשוב: bootstrap חייב להיות נקי לגמרי
  if (req.url.includes('/api/v1/auth/bootstrap')) {
    const cleaned = req.clone({
      withCredentials: true,
      headers: req.headers
        .delete('Authorization')
        .delete('X-Session-Id')
    });
    return next(cleaned);
  }

  // Cookie-only mode → לא מצמידים JWT בכלל
  if ((environment as { authMode?: string }).authMode === 'cookie_only') {
    return next(req.clone({ withCredentials: true }));
  }

  if (req.headers.has('Authorization')) {
    return next(req);
  }

  if (req.url.includes('/auth/token')) {
    return next(req);
  }

  const authService = inject(AuthService);

  return from(authService.getToken()).pipe(
    switchMap(token => {
      // ❗ אל תשלח Bearer ריק
      if (!token) {
        return next(req);
      }

      const cloned = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });

      return next(cloned);
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const errorCode = (error.error as any)?.code;

        if (errorCode === 'INVALID_TOKEN') {
          return from(authService.refreshToken()).pipe(
            switchMap(newToken => {
              if (!newToken) return next(req);

              const retried = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`
                }
              });

              return next(retried);
            }),
            catchError(refreshError => throwError(() => refreshError))
          );
        }
      }

      return throwError(() => error);
    })
  );
};
