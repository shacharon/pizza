/**
 * Assistant SSE Service
 * Connects to SSE endpoint for assistant/narrator streaming
 * 
 * Replaces WebSocket 'assistant' channel subscription
 * Uses session cookie authentication (no Authorization header)
 */

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * SSE Event Types
 * Streaming: meta → narration → delta (0..n) → done
 * Legacy: meta → message → done
 */
export type AssistantSseEvent =
  | { type: 'meta'; data: { requestId: string; language: string; startedAt: string } }
  | { type: 'narration'; data: { text: string } }
  | { type: 'delta'; data: { text: string } }
  | { type: 'message'; data: AssistantMessagePayload }
  | { type: 'done' }
  | { type: 'error'; data: { code: string; message: string } }
  | { type: 'ping'; data?: { ts?: number } };

/**
 * Assistant message payload (matches backend AssistantOutput)
 */
export interface AssistantMessagePayload {
  type: 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL' | 'SEARCH_FAILED' | 'GENERIC_QUERY_NARRATION';
  message: string;
  question: string | null;
  blocksSearch: boolean;
  language?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AssistantSseService {
  private readonly apiBaseUrl = `${environment.apiUrl}${environment.apiBasePath}`;

  /**
   * Connect to SSE endpoint for assistant streaming
   * 
   * @param requestId - The search request ID
   * @returns Observable of SSE events
   * 
   * Usage:
   * ```
   * assistantSse.connect(requestId).subscribe({
   *   next: (event) => {
   *     if (event.type === 'message') {
   *       handleAssistantMessage(event.data);
   *     }
   *   },
   *   error: (err) => console.error('SSE error', err),
   *   complete: () => console.log('SSE complete')
   * });
   * ```
   */
  connect(requestId: string): Observable<AssistantSseEvent> {
    return new Observable<AssistantSseEvent>(observer => {
      const url = `${this.apiBaseUrl}/stream/assistant/${requestId}`;

      console.log('[AssistantSSE] Connecting to SSE', {
        requestId: requestId.substring(0, 20) + '...',
        url,
        timestamp: new Date().toISOString()
      });

      // Create EventSource with credentials (sends session cookie)
      // TypeScript: withCredentials is not in standard EventSourceInit type, cast to any
      const eventSource = new EventSource(url, { withCredentials: true } as any);

      let hasReceivedMeta = false;
      let messageCount = 0;

      // Listen for 'meta' event (and 'metadata' for backward compatibility)
      eventSource.addEventListener('meta', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[AssistantSSE] meta event', { requestId: data.requestId, language: data.language });
          hasReceivedMeta = true;
          observer.next({ type: 'meta', data });
        } catch (error) {
          console.error('[AssistantSSE] Failed to parse meta event', error);
        }
      });

      // BACKWARD COMPATIBILITY: Also listen for 'metadata' (older backend versions)
      eventSource.addEventListener('metadata', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[AssistantSSE] metadata event (legacy)', { requestId: data.requestId });
          if (!hasReceivedMeta) {
            hasReceivedMeta = true;
            observer.next({ type: 'meta', data });
          }
        } catch (error) {
          console.error('[AssistantSSE] Failed to parse metadata event', error);
        }
      });

      // Listen for 'narration' event (streaming: initial text, e.g. "Searching...")
      eventSource.addEventListener('narration', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { text: string };
          console.log('[AssistantSSE] narration event', { preview: data.text?.substring(0, 40) + '...' });
          observer.next({ type: 'narration', data });
        } catch (error) {
          console.error('[AssistantSSE] Failed to parse narration event', error);
        }
      });

      // Listen for 'delta' event (streaming: chunk to append)
      eventSource.addEventListener('delta', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { text: string };
          observer.next({ type: 'delta', data });
        } catch (error) {
          console.error('[AssistantSSE] Failed to parse delta event', error);
        }
      });

      // Listen for 'ping' (heartbeat, ignore for UI)
      eventSource.addEventListener('ping', () => {
        // No-op; keeps connection alive
      });

      // Listen for 'message' event (legacy: single full assistant message)
      eventSource.addEventListener('message', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as AssistantMessagePayload;
          messageCount++;
          console.log('[AssistantSSE] message event (legacy)', {
            type: data.type,
            messageNum: messageCount,
            preview: data.message?.substring(0, 50) + '...'
          });
          observer.next({ type: 'message', data });
        } catch (error) {
          console.error('[AssistantSSE] Failed to parse message event', error);
        }
      });

      // Listen for 'done' event (stream complete)
      eventSource.addEventListener('done', (e: MessageEvent) => {
        console.log('[AssistantSSE] done event', { messageCount, requestId: requestId.substring(0, 20) + '...' });
        observer.next({ type: 'done' });
        eventSource.close();
        observer.complete();
      });

      // Listen for 'error' event (server-side error)
      eventSource.addEventListener('error', (e: MessageEvent) => {
        try {
          const data = e.data ? JSON.parse(e.data) : { code: 'UNKNOWN', message: 'SSE error' };
          console.error('[AssistantSSE] error event', data);
          observer.next({ type: 'error', data });
          eventSource.close();
          observer.complete();
        } catch (parseError) {
          console.error('[AssistantSSE] Failed to parse error event', parseError);
          eventSource.close();
          observer.complete();
        }
      });

      // Handle connection errors (network issues, server unreachable)
      eventSource.onerror = (err) => {
        console.error('[AssistantSSE] Connection error', {
          readyState: eventSource.readyState,
          requestId: requestId.substring(0, 20) + '...'
        });

        // EventSource automatically reconnects on transient errors
        // Only close if CLOSED state (permanent failure)
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
          observer.error(new Error('SSE connection closed'));
        }
      };

      // Cleanup: Close EventSource on unsubscribe
      return () => {
        console.log('[AssistantSSE] Closing connection', {
          requestId: requestId.substring(0, 20) + '...',
          messageCount
        });
        eventSource.close();
      };
    });
  }
}
