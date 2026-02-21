/**
 * Assistant SSE Service
 * Connects to SSE endpoint for assistant/narrator streaming
 *
 * Uses fetch() + ReadableStream + TextDecoder('utf-8') for explicit UTF-8 decoding.
 * Replaces WebSocket 'assistant' channel subscription.
 * Uses session cookie authentication (no Authorization header).
 */

import { Injectable } from '@angular/core';
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
  suggestedAction?: string;
}

const UTF8 = 'utf-8';

/**
 * Parse SSE buffer into events. Buffer may contain multiple events separated by "\n\n".
 * Decode with UTF-8 only; split on "\n\n", parse "data:" as JSON.
 * Returns events and any incomplete leftover for next chunk.
 */
function parseSseChunk(
  buffer: string
): { events: Array<{ event: string; data: unknown }>; leftover: string } {
  const events: Array<{ event: string; data: unknown }> = [];
  const hasIncomplete = !buffer.endsWith('\n\n');
  const parts = buffer.split('\n\n');
  const completeCount = hasIncomplete ? Math.max(0, parts.length - 1) : parts.length;
  const leftover = hasIncomplete && parts.length > 0 ? parts[parts.length - 1]! + '\n\n' : '';

  for (let i = 0; i < completeCount; i++) {
    const block = parts[i]!.trim();
    if (!block.length || block.startsWith(':')) continue;
    let eventType = 'message';
    let dataLine: string | null = null;
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
    }
    if (dataLine !== null) {
      try {
        events.push({ event: eventType, data: JSON.parse(dataLine) as unknown });
      } catch {
        // Skip malformed data
      }
    }
  }
  return { events, leftover };
}

@Injectable({
  providedIn: 'root'
})
export class AssistantSseService {
  private readonly apiBaseUrl = `${environment.apiUrl}${environment.apiBasePath}`;

  /**
   * Connect to SSE endpoint using fetch + ReadableStream.
   * Decodes stream with TextDecoder('utf-8'), splits on "\n\n", parses "data:" as JSON.
   */
  connect(requestId: string): Observable<AssistantSseEvent> {
    return new Observable<AssistantSseEvent>(observer => {
      const url = `${this.apiBaseUrl}/stream/assistant/${requestId}`;

      console.log('[AssistantSSE] Connecting to SSE', {
        requestId: requestId.substring(0, 20) + '...',
        url,
        timestamp: new Date().toISOString()
      });

      const decoder = new TextDecoder(UTF8);
      let buffer = '';
      let aborted = false;

      fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'text/event-stream' }
      })
        .then(async (response): Promise<void> => {
          if (!response.ok || !response.body) {
            observer.error(new Error(`SSE failed: ${response.status}`));
            return;
          }
          const reader = response.body.getReader();
          try {
            while (!aborted) {
              const { value, done } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              const { events, leftover } = parseSseChunk(buffer);
              buffer = leftover;
              for (const { event, data } of events) {
                if (event === 'meta') {
                  observer.next({ type: 'meta', data: data as { requestId: string; language: string; startedAt: string } });
                } else if (event === 'metadata') {
                  observer.next({ type: 'meta', data: data as { requestId: string; language: string; startedAt: string } });
                } else if (event === 'narration') {
                  observer.next({ type: 'narration', data: data as { text: string } });
                } else if (event === 'delta') {
                  observer.next({ type: 'delta', data: data as { text: string } });
                } else if (event === 'ping') {
                  // no-op
                } else if (event === 'message') {
                  observer.next({ type: 'message', data: data as AssistantMessagePayload });
                } else if (event === 'done') {
                  observer.next({ type: 'done' });
                  observer.complete();
                  return;
                } else if (event === 'error') {
                  const err = data as { code?: string; message?: string };
                  observer.next({ type: 'error', data: { code: err?.code ?? 'UNKNOWN', message: err?.message ?? 'SSE error' } });
                  observer.complete();
                  return;
                }
              }
            }
            if (!aborted) observer.complete();
          } finally {
            reader.releaseLock();
          }
        })
        .catch(err => {
          if (!aborted) observer.error(err);
        });

      return () => {
        aborted = true;
        console.log('[AssistantSSE] Closing connection', { requestId: requestId.substring(0, 20) + '...' });
      };
    });
  }
}
