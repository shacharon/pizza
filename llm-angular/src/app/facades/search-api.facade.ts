/**
 * Search API & Polling Handler
 * Handles HTTP search requests and result polling
 */

import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SearchApiClient } from '../api/search.api';
import { buildApiUrl } from '../shared/api/api.config';
import type { SearchResponse, SearchFilters } from '../domain/types/search.types';
import type { PollingConfig } from './search.facade.types';
import { DEFAULT_POLLING_CONFIG } from './search.facade.types';

@Injectable()
export class SearchApiHandler {
  private readonly searchApiClient = inject(SearchApiClient);

  // Polling state
  private pollingStartTimeoutId?: any;
  private pollingIntervalId?: any;
  private pollingTimeoutId?: any;

  /**
   * Execute search API call (returns 202 or 200)
   */
  async executeSearch(params: {
    query: string;
    filters?: SearchFilters;
    sessionId: string;
    userLocation?: { lat: number; lng: number };
    clearContext?: boolean;
    locale: string;
  }): Promise<{ requestId: string; resultUrl: string } | SearchResponse> {
    return firstValueFrom(this.searchApiClient.searchAsync(params));
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
    console.log('[SearchApiHandler] Scheduling polling start', { delay: config.delayMs, requestId });

    // Defer polling start (if WS delivers first, this is canceled)
    this.pollingStartTimeoutId = setTimeout(() => {
      const resultUrl = buildApiUrl(`/search/${requestId}/result`);
      const startTime = Date.now();

      console.log('[SearchApiHandler] Starting polling', { requestId, resultUrl });

      // Set max duration timeout
      this.pollingTimeoutId = setTimeout(() => {
        console.warn('[SearchApiHandler] Polling max duration reached - stopping');
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
          try {
            const pollResponse = await firstValueFrom(this.searchApiClient.pollResult(resultUrl));

            // Check if FAILED
            if ('status' in pollResponse && pollResponse.status === 'FAILED') {
              console.error('[SearchApiHandler] Poll FAILED', { error: (pollResponse as any).error });
              this.cancelPolling();
              const errorMsg = (pollResponse as any).error?.message || 'Search failed';
              onError(errorMsg);
              return;
            }

            // Check if still pending
            if (!('results' in pollResponse) || pollResponse.results === undefined) {
              console.log('[SearchApiHandler] Poll PENDING', { elapsed, useSlow });
              if (onProgress) onProgress();
              scheduleNextPoll();
              return;
            }

            // Got results
            const doneResponse = pollResponse as SearchResponse;
            console.log('[SearchApiHandler] Poll DONE', { resultCount: doneResponse.results.length, elapsed });
            this.cancelPolling();
            onResult(doneResponse);

          } catch (error: any) {
            // Handle 404 (job expired/not found)
            if (error?.status === 404) {
              console.error('[SearchApiHandler] Poll 404 - job expired');
              this.cancelPolling();
              onError('Search expired - please retry');
              return;
            }

            // Other errors - retry
            console.error('[SearchApiHandler] Poll error:', error);
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
   */
  cancelPolling(): void {
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
      console.log('[SearchApiHandler] Polling start canceled (WS active)');
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
    } catch (error) {
      console.error('[SearchApiHandler] Fetch result failed:', error);
      throw error;
    }
  }
}
