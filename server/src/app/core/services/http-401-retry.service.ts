/**
 * HTTP 401 Retry Service
 * Wraps HttpClient to auto-retry on 401 with session bootstrap
 * 
 * Flow:
 * 1. Make API request
 * 2. If 401 → call bootstrap() → retry once
 * 3. If still 401 → propagate error
 * 
 * Does NOT modify existing auth.interceptor.
 * Works in parallel with JWT flow.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, defer, retry, catchError, switchMap } from 'rxjs';
import { SessionBootstrapService } from './session-bootstrap.service';

interface RequestOptions {
  headers?: HttpHeaders | { [header: string]: string | string[] };
  observe?: 'body';
  params?: any;
  reportProgress?: boolean;
  responseType?: 'json';
  withCredentials?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class Http401RetryService {
  private readonly http = inject(HttpClient);
  private readonly bootstrapService = inject(SessionBootstrapService);

  /**
   * GET with 401 retry
   */
  get<T>(url: string, options?: RequestOptions): Observable<T> {
    return this.requestWithRetry<T>('GET', url, undefined, options);
  }

  /**
   * POST with 401 retry
   */
  post<T>(url: string, body: any, options?: RequestOptions): Observable<T> {
    return this.requestWithRetry<T>('POST', url, body, options);
  }

  /**
   * PUT with 401 retry
   */
  put<T>(url: string, body: any, options?: RequestOptions): Observable<T> {
    return this.requestWithRetry<T>('PUT', url, body, options);
  }

  /**
   * DELETE with 401 retry
   */
  delete<T>(url: string, options?: RequestOptions): Observable<T> {
    return this.requestWithRetry<T>('DELETE', url, undefined, options);
  }

  /**
   * Core retry logic
   * 
   * Handles:
   * - 401 → bootstrap → retry once
   * - Other errors → propagate immediately
   */
  private requestWithRetry<T>(
    method: string,
    url: string,
    body?: any,
    options?: RequestOptions
  ): Observable<T> {
    // Ensure withCredentials: true for all requests
    const finalOptions = {
      ...options,
      withCredentials: true
    };

    let attemptCount = 0;

    return defer(() => {
      attemptCount++;

      // Execute request
      let request$: Observable<T>;
      if (method === 'GET' || method === 'DELETE') {
        request$ = this.http.request<T>(method, url, finalOptions);
      } else {
        request$ = this.http.request<T>(method, url, { ...finalOptions, body });
      }

      return request$.pipe(
        catchError((error: HttpErrorResponse) => {
          // Only retry on 401 and only once
          if (error.status === 401 && attemptCount === 1) {
            console.debug('[Http401Retry] bootstrap_retry', {
              url,
              method,
              attempt: attemptCount
            });

            // Bootstrap and retry
            return defer(async () => {
              await this.bootstrapService.bootstrap();
              console.debug('[Http401Retry] bootstrap_retry_complete - retrying request');
            }).pipe(
              switchMap(() => {
                // Retry the request
                if (method === 'GET' || method === 'DELETE') {
                  return this.http.request<T>(method, url, finalOptions);
                } else {
                  return this.http.request<T>(method, url, { ...finalOptions, body });
                }
              })
            );
          }

          // Propagate non-401 or second 401
          if (error.status === 401 && attemptCount > 1) {
            console.debug('[Http401Retry] 401_after_retry - propagating error');
          }
          return throwError(() => error);
        })
      );
    });
  }
}
