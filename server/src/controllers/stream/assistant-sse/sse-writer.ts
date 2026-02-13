/**
 * SSE Writer
 * Handles SSE header setup and event writing
 * Single responsibility: SSE protocol formatting
 */

import type { Response } from 'express';
import type { SseMetaPayload, SseMessagePayload, SseErrorPayload, SseDonePayload } from './models.js';

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
  }

  /**
   * Flush headers to client
   */
  flushHeaders(): void {
    this.res.flushHeaders();
  }

  /**
   * Send SSE event
   */
  private sendEvent(event: string, data: any): void {
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
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
   * Send done event
   */
  sendDone(payload: SseDonePayload = {}): void {
    this.sendEvent('done', payload);
  }

  /**
   * End the response stream
   */
  end(): void {
    this.res.end();
  }
}
