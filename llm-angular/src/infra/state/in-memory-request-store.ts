/**
 * Phase 2: In-Memory Request State Store
 * Production: Replace with Redis for multi-instance deployments
 */

import { logger } from '../../lib/logger/structured-logger.js';
import type { IRequestStateStore, RequestState } from './request-state.store.js';

export class InMemoryRequestStore implements IRequestStateStore {
  private store = new Map<string, { state: RequestState; expiresAt: number }>();
  private cleanupInterval: NodeJS.Timeout | undefined;

  constructor(
    private defaultTtlSeconds = 300,
    private cleanupIntervalMs = 60_000
  ) {
    this.startCleanup();
    logger.info({
      ttlSeconds: defaultTtlSeconds,
      cleanupIntervalMs
    }, 'InMemoryRequestStore initialized');
  }

  async set(requestId: string, state: RequestState, ttl = this.defaultTtlSeconds): Promise<void> {
    const expiresAt = Date.now() + ttl * 1000;
    this.store.set(requestId, {
      state: { ...state, expiresAt },
      expiresAt
    });

    logger.debug({
      requestId,
      ttlSeconds: ttl,
      expiresAt: new Date(expiresAt).toISOString()
    }, 'State stored');
  }

  async get(requestId: string): Promise<RequestState | null> {
    const entry = this.store.get(requestId);
    
    if (!entry) {
      logger.debug({ requestId }, 'State not found');
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(requestId);
      logger.debug({ requestId }, 'State expired');
      return null;
    }

    return entry.state;
  }

  async delete(requestId: string): Promise<void> {
    const deleted = this.store.delete(requestId);
    if (deleted) {
      logger.debug({ requestId }, 'State deleted');
    }
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({
        cleaned,
        remaining: this.store.size
      }, 'State cleanup completed');
    }

    return cleaned;
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(err => {
        logger.error({ err }, 'State cleanup failed');
      });
    }, this.cleanupIntervalMs);

    // Prevent Node.js from waiting for this interval to exit
    this.cleanupInterval.unref();
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    const entriesCount = this.store.size;
    this.store.clear();

    logger.info({
      clearedEntries: entriesCount
    }, 'InMemoryRequestStore shutdown');
  }

  // Utility for monitoring
  getStats(): { size: number; oldestExpiry: number | null } {
    let oldestExpiry: number | null = null;

    for (const entry of this.store.values()) {
      if (oldestExpiry === null || entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
      }
    }

    return {
      size: this.store.size,
      oldestExpiry
    };
  }
}
