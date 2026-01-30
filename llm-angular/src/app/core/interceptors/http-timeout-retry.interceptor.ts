import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { Observable, throwError, timer, of } from 'rxjs';
import { catchError, timeout, mergeMap, retryWhen, take } from 'rxjs/operators';

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 1;

/**
 * HTTP Timeout + Retry Interceptor
 * 
 * Retry Logic:
 * - Retries network errors (status=0) and 5xx errors up to MAX_RETRIES times
 * - Does NOT retry 4xx client errors
 * - Uses 300ms backoff between retries
 * 
 * CRITICAL: Ensures observable NEVER completes without emission (prevents EmptyError)
 * - All error paths use throwError() to propagate errors
 * - No catchError(() => EMPTY) patterns
 * - retryWhen always terminates with error or success (never silent completion)
 */
export function httpTimeoutRetryInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    let attemptCount = 0;

    return next(req).pipe(
        timeout(REQUEST_TIMEOUT_MS),
        retryWhen(errors => errors.pipe(
            mergeMap((error: HttpErrorResponse) => {
                attemptCount++;

                // Determine if we should retry
                const isRetryable = error.status === 0 || error.status >= 500;
                const hasRetriesLeft = attemptCount <= MAX_RETRIES;

                if (isRetryable && hasRetriesLeft) {
                    // Retry after delay
                    return timer(300);
                } else {
                    // No more retries - propagate error (never completes silently)
                    return throwError(() => error);
                }
            }),
            take(MAX_RETRIES + 1) // Safety: limit total attempts
        )),
        catchError((err: unknown) => {
            // Final catchError to ensure we always throw, never complete
            return throwError(() => err);
        })
    );
}


