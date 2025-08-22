import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, retryWhen, scan, timeout } from 'rxjs/operators';

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 1;

export function httpTimeoutRetryInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    return next(req).pipe(
        timeout(REQUEST_TIMEOUT_MS),
        retryWhen(errors => errors.pipe(
            scan((acc, err) => {
                if (acc >= MAX_RETRIES || err instanceof HttpErrorResponse && err.status < 500 && err.status !== 0) {
                    throw err;
                }
                return acc + 1;
            }, 0),
            // brief backoff
            // delay between retries
            (errCount) => timer(300)
        )),
        catchError((err: unknown) => throwError(() => err))
    );
}


