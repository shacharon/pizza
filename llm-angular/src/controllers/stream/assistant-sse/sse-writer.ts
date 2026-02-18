/**
 * SSE Writer
 * Handles SSE header setup and event writing
 * Single responsibility: SSE protocol formatting
 */

import type { Response } from 'express';
import type { SseMetaPayload, SseMessagePayload, SseErrorPayload, SseDonePayload, SseNarrationPayload, SseDeltaPayload } from './models.js';

export class SseWriter {
  private readonly res: Response;

  constructor(res: Response) {
    this.res = res;
  }

  /**
   * Set SSE headers and flush immediately
   */
  setHeaders(): void {
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    this.res.setHeader('Content-Encoding', 'none'); // Disable compression
    this.res.setHeader('Transfer-Encoding', 'chunked'); // Enable chunked transfer
  }

  /**
   * Flush headers to client
   */
  flushHeaders(): void {
    this.res.flushHeaders();
  }

  /**
   * Send SSE event
   * CRITICAL: Flush after each event to ensure immediate delivery (no buffering)
   */
  private sendEvent(event: string, data: any): void {
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
    
    // Flush immediately to prevent buffering (especially important for deltas)
    if (typeof (this.res as any).flush === 'function') {
      (this.res as any).flush();
    }
  }

  /**
   * Send meta event
   */
  sendMeta(payload: SseMetaPayload): void {
    this.sendEvent('meta', payload);
  }

  /**
   * Send message event
   */
  sendMessage(payload: SseMessagePayload): void {
    this.sendEvent('message', payload);
  }

  /**
   * Send error event
   */
  sendError(payload: SseErrorPayload): void {
    this.sendEvent('error', payload);
  }

  /**
   * Send narration event (immediate "working…" text)
   */
  sendNarration(payload: SseNarrationPayload): void {
    this.sendEvent('narration', payload);
  }

  /**
   * Send delta event (streaming chunk; client appends)
   */
  sendDelta(payload: SseDeltaPayload): void {
    this.sendEvent('delta', payload);
  }

  /**
   * Send ping (heartbeat every 25s)
   */
  sendPing(): void {
    this.sendEvent('ping', { ts: Date.now() });
  }

  /**
   * Send done event
   */
  sendDone(payload: SseDonePayload = {}): void {
    this.sendEvent('done', payload);
  }

  /**
   * Send SSE comment (keeps connection alive for gateways/ALB; no client-side event)
   */
  sendComment(comment: string = 'k'): void {
    this.res.write(`: ${comment}\n\n`);
  }

  /**
   * End the response stream
   */
  end(): void {
    this.res.end();
  }
}
