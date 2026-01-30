import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * HTTP Error Interceptor (Pass-through)
 * 
 * IMPORTANT: This interceptor does NOT transform HttpErrorResponse objects.
 * Error mapping is handled by individual API clients using mapApiError().
 * This interceptor only logs errors for debugging (development mode).
 * 
 * Rationale:
 * - HttpErrorResponse contains structured error info (status, headers, body)
 * - Converting to plain Error loses this information
 * - API clients need the full HttpErrorResponse for proper error handling
 */
export function httpErrorInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    return next(req).pipe(
        catchError((err: unknown) => {
            // Pass through all errors unchanged (no transformation)
            // Individual API clients will handle error mapping
            return throwError(() => err);
        })
    );
}


