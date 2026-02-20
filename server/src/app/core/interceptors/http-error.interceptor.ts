import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export function httpErrorInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    return next(req).pipe(
        catchError((err: unknown) => {
            if (err instanceof HttpErrorResponse) {
                const status = err.status;
                const message = (err.error && (err.error.message || err.error.error)) || err.message || 'Request failed';
                return throwError(() => new Error(status ? `${status}: ${message}` : message));
            }
            return throwError(() => new Error('Network error'));
        })
    );
}


