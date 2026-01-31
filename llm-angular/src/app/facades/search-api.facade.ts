/**
 * Search API & Polling Handler
 * Handles HTTP search requests and result polling
 */

import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, EmptyError } from 'rxjs';
import { SearchApiClient } from '../api/search.api';
import { buildApiUrl } from '../shared/api/api.config';
import type { SearchResponse, SearchFilters } from '../domain/types/search.types';
import type { PollingConfig } from './search.facade.types';
import { DEFAULT_POLLING_CONFIG } from './search.facade.types';
import { safeLog, safeError, safeWarn } from '../shared/utils/safe-logger';

@Injectable()
export class SearchApiHandler {
  private readonly searchApiClient = inject(SearchApiClient);

  // Polling state
  private pollingStartTimeoutId?: any;
  private pollingIntervalId?: any;
  private pollingTimeoutId?: any;
  
  // P0-4: AbortController for hard-stop of active polling
  // Ensures only one poll runs per search (no overlap on rapid searches)
  private pollingAbortController?: AbortController;

  /**
   * Execute search API call (returns 202 or 200)
   * 
   * Error Handling:
   * - Network errors (status=0): User-friendly error message
   * - HTTP errors: Propagated as ApiErrorView
   * - EmptyError: Should never happen, but handled as network error
   * 
   * P0 Scale Safety: Supports idempotency key for retry protection during ECS autoscaling.
   * 
   * @param params - Search parameters including optional idempotencyKey
   */
  async executeSearch(params: {
    query: string;
    filters?: SearchFilters;
    sessionId: string;
    userLocation?: { lat: number; lng: number };
    clearContext?: boolean;
    uiLanguage?: 'he' | 'en';
    idempotencyKey?: string;
  }): Promise<{ requestId: string; resultUrl: string } | SearchResponse> {
    try {
      return await firstValueFrom(this.searchApiClient.searchAsync(params, params.idempotencyKey));
    } catch (error: any) {
      // Handle EmptyError (should never happen, but defensive)
      if (error instanceof EmptyError) {
        safeError('SearchApiHandler', 'Unexpected EmptyError - observable completed without emission');
        throw {
          message: 'Unable to connect to server. Please check your internet connection.',
          code: 'NETWORK_ERROR',
          status: 0
        };
      }

      // Handle network connection errors (status=0)
      if (error?.status === 0 || error?.code === 'NETWORK_ERROR') {
        safeError('SearchApiHandler', 'Network connection error', { code: error.code, status: error.status });
        throw {
          message: 'Unable to connect to server. Please check your internet connection.',
          code: 'NETWORK_ERROR',
          status: 0
        };
      }

      // Propagate other errors as-is
      throw error;
    }
  }

  /**
   * Start polling for async search results
   */
  startPolling(
    requestId: string,
    query: string,
    onResult: (response: SearchResponse) => void,
    onError: (error: string) => void,
    onProgress?: () => void,
    config: PollingConfig = DEFAULT_POLLING_CONFIG
  ): void {
    safeLog('SearchApiHandler', 'Scheduling polling start', { delay: config.delayMs, requestId });

    // P0-4: Create new AbortController for this polling session
    // Previous controller (if any) will be aborted in cancelPolling
    this.pollingAbortController = new AbortController();
    const abortSignal = this.pollingAbortController.signal;

    // Defer polling start (if WS delivers first, this is canceled)
    this.pollingStartTimeoutId = setTimeout(() => {
      // P0-4: Check if already aborted before starting poll loop
      if (abortSignal.aborted) {
        safeLog('SearchApiHandler', 'Polling aborted before start', { requestId });
        return;
      }

      const resultUrl = buildApiUrl(`/search/${requestId}/result`);
      const startTime = Date.now();

      safeLog('SearchApiHandler', 'Starting polling', { requestId, resultUrl });

      // Set max duration timeout
      this.pollingTimeoutId = setTimeout(() => {
        safeWarn('SearchApiHandler', 'Polling max duration reached - stopping');
        this.cancelPolling();
      }, config.maxDuration);

      // Jittered polling with backoff
      const scheduleNextPoll = () => {
        const elapsed = Date.now() - startTime;
        const useSlow = elapsed > config.backoffAt;
        const interval = useSlow
          ? config.slowInterval
          : config.fastIntervalBase + (Math.random() * config.fastJitter * 2 - config.fastJitter);

        this.pollingIntervalId = setTimeout(async () => {
          // P0-4: Check abort signal before each poll attempt
          if (abortSignal.aborted) {
            safeLog('SearchApiHandler', 'Polling aborted during loop', { requestId });
            return;
          }

          try {
            const pollResponse = await firstValueFrom(this.searchApiClient.pollResult(resultUrl));

            // Check if FAILED
            if ('status' in pollResponse && pollResponse.status === 'FAILED') {
              safeError('SearchApiHandler', 'Poll FAILED', { error: (pollResponse as any).error });
              this.cancelPolling();
              const errorMsg = (pollResponse as any).error?.message || 'Search failed';
              onError(errorMsg);
              return;
            }

            // Check if still pending
            if (!('results' in pollResponse) || pollResponse.results === undefined) {
              safeLog('SearchApiHandler', 'Poll PENDING', { elapsed, useSlow });
              if (onProgress) onProgress();
              scheduleNextPoll();
              return;
            }

            // Got results
            const doneResponse = pollResponse as SearchResponse;
            safeLog('SearchApiHandler', 'Poll DONE', { resultCount: doneResponse.results.length, elapsed });
            this.cancelPolling();
            onResult(doneResponse);

          } catch (error: any) {
            // Handle EmptyError (should never happen)
            if (error instanceof EmptyError) {
              safeError('SearchApiHandler', 'Unexpected EmptyError during polling');
              this.cancelPolling();
              onError('Unable to connect to server. Please check your internet connection.');
              return;
            }

            // Handle network errors (status=0) - stop retrying
            if (error?.status === 0 || error?.code === 'NETWORK_ERROR') {
              safeError('SearchApiHandler', 'Network connection error during polling', { code: error.code, status: error.status });
              this.cancelPolling();
              onError('Unable to connect to server. Please check your internet connection.');
              return;
            }

            // Handle 404 (job expired/not found)
            if (error?.status === 404) {
              safeError('SearchApiHandler', 'Poll 404 - job expired');
              this.cancelPolling();
              onError('Search expired - please retry');
              return;
            }

            // Other errors (5xx, timeouts) - continue retrying
            safeError('SearchApiHandler', 'Poll error - will retry', { status: error?.status, code: error?.code });
            scheduleNextPoll();
          }
        }, interval);
      };

      // Start first poll
      scheduleNextPoll();
    }, config.delayMs);
  }

  /**
   * Cancel all polling timers
   * P0-4: Now also aborts active HTTP requests via AbortController
   */
  cancelPolling(): void {
    // P0-4: Abort any active polling HTTP requests
    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
      this.pollingAbortController = undefined;
    }

    if (this.pollingStartTimeoutId) {
      clearTimeout(this.pollingStartTimeoutId);
      this.pollingStartTimeoutId = undefined;
    }
    if (this.pollingIntervalId) {
      clearTimeout(this.pollingIntervalId);
      this.pollingIntervalId = undefined;
    }
    if (this.pollingTimeoutId) {
      clearTimeout(this.pollingTimeoutId);
      this.pollingTimeoutId = undefined;
    }
  }

  /**
   * Cancel polling start (used when WS delivers first)
   */
  cancelPollingStart(): void {
    if (this.pollingStartTimeoutId) {
      clearTimeout(this.pollingStartTimeoutId);
      this.pollingStartTimeoutId = undefined;
      safeLog('SearchApiHandler', 'Polling start canceled (WS active)');
    }
  }

  /**
   * Fetch result from URL (used by WS ready event)
   */
  async fetchResult(requestId: string): Promise<SearchResponse | null> {
    const resultUrl = buildApiUrl(`/search/${requestId}/result`);
    try {
      const response = await firstValueFrom(this.searchApiClient.pollResult(resultUrl));
      if (!('status' in response)) {
        return response as SearchResponse;
      }
      return null;
    } catch (error: any) {
      // Handle EmptyError
      if (error instanceof EmptyError) {
        safeError('SearchApiHandler', 'Unexpected EmptyError during fetch');
        throw {
          message: 'Unable to connect to server. Please check your internet connection.',
          code: 'NETWORK_ERROR',
          status: 0
        };
      }

      safeError('SearchApiHandler', 'Fetch result failed', { status: error?.status, code: error?.code });
      throw error;
    }
  }
}
