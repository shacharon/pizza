/**
 * Ranking Signals Cache - Redis Implementation
 * 
 * Stores ranking signals in Redis with TTL for distributed access.
 * Includes IDOR protection via session/user ownership verification.
 * 
 * Uses shared RedisService (same lifecycle as RedisJobStore).
 */

import type { Redis } from 'ioredis';
import type { RankingSignals } from './ranking-signals.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { RedisService } from '../../../../infra/redis/redis.service.js';
import { hashSessionId } from '../../../../utils/security.utils.js';

const KEY_PREFIX = 'ranking:signals:';
const TTL_SECONDS = 10 * 60; // 10 minutes

interface CacheEntry {
  signals: RankingSignals;
  query: string;
  uiLanguage: 'he' | 'en';
  sessionId?: string;  // For IDOR verification
  userId?: string;     // For IDOR verification
  timestamp: number;
}

export class RankingSignalsCacheRedis {
  private redis: Redis | null = null;

  constructor() {
    // No initialization during module load
    // Redis client is retrieved on-demand via RedisService.getClientOrNull()
  }

  /**
   * Get Redis client from shared RedisService
   * Fail-open: returns null if Redis unavailable (no repeated warnings)
   */
  private getRedis(): Redis | null {
    if (!this.redis) {
      // Use shared RedisService (same lifecycle as RedisJobStore)
      this.redis = RedisService.getClientOrNull();
    }
    return this.redis;
  }

  /**
   * Store ranking signals for a request with ownership info
   */
  async set(
    requestId: string,
    signals: RankingSignals,
    query: string,
    uiLanguage: 'he' | 'en',
    sessionId?: string,
    userId?: string
  ): Promise<void> {
    const redis = this.getRedis();

    if (!redis) {
      // Fail-open: Redis unavailable, skip cache silently
      logger.debug({
        requestId,
        event: 'ranking_signals_cache_skip_redis_unavailable'
      }, '[RANKING_CACHE] Redis unavailable, skipping cache');
      return;
    }

    try {
      const entry: CacheEntry = {
        signals,
        query,
        uiLanguage,
        sessionId,
        userId,
        timestamp: Date.now()
      };

      const key = KEY_PREFIX + requestId;
      const value = JSON.stringify(entry);

      await redis.setex(key, TTL_SECONDS, value);

      logger.debug({
        requestId,
        ttlSeconds: TTL_SECONDS,
        hasSessionId: !!sessionId,
        hasUserId: !!userId,
        event: 'ranking_signals_cached_redis'
      }, '[RANKING_CACHE] Cached ranking signals in Redis');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({
        requestId,
        error: msg,
        event: 'ranking_signals_cache_set_failed'
      }, '[RANKING_CACHE] Failed to cache ranking signals (non-fatal)');
    }
  }

  /**
   * Retrieve ranking signals with IDOR verification
   * 
   * @param requestId - Request ID to retrieve
   * @param sessionId - Session ID of the requester (for IDOR check)
   * @param userId - User ID of the requester (for IDOR check)
   * @returns Cached entry or null if not found / IDOR violation
   */
  async get(
    requestId: string,
    sessionId?: string,
    userId?: string
  ): Promise<{ signals: RankingSignals; query: string; uiLanguage: 'he' | 'en' } | null> {
    const redis = this.getRedis();

    if (!redis) {
      // Fail-open: Redis unavailable, return null silently
      logger.debug({
        requestId,
        event: 'ranking_cache_get_skip_redis_unavailable'
      }, '[RANKING_CACHE] Redis unavailable, cannot retrieve');
      return null;
    }

    try {
      const key = KEY_PREFIX + requestId;
      const value = await redis.get(key);

      if (!value) {
        logger.debug({
          requestId,
          event: 'ranking_signals_cache_miss'
        }, '[RANKING_CACHE] Cache miss (expired or never cached)');
        return null;
      }

      const entry: CacheEntry = JSON.parse(value);

      // IDOR Protection: Verify ownership
      const ownershipValid = this.verifyOwnership(entry, sessionId, userId, requestId);

      if (!ownershipValid) {
        logger.warn({
          requestId,
          event: 'ranking_signals_cache_idor_violation',
          reason: 'ownership_mismatch'
        }, '[RANKING_CACHE] IDOR violation detected - ownership mismatch');
        return null;
      }

      logger.debug({
        requestId,
        event: 'ranking_signals_cache_hit'
      }, '[RANKING_CACHE] Cache hit');

      return {
        signals: entry.signals,
        query: entry.query,
        uiLanguage: entry.uiLanguage
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({
        requestId,
        error: msg,
        event: 'ranking_signals_cache_get_failed'
      }, '[RANKING_CACHE] Failed to retrieve from cache');
      return null;
    }
  }

  /**
   * Verify ownership for IDOR protection
   * 
   * STRICT SYMMETRIC RULES (No "unauthenticated allow" downgrade):
   * - If cached entry has sessionId → request MUST have matching sessionId
   * - If cached entry has NO sessionId → request MUST also have NO sessionId
   * - Same rules apply for userId
   * 
   * This prevents authenticated users from accessing unauthenticated cache entries
   * and vice versa (no privilege escalation/downgrade).
   */
  private verifyOwnership(
    entry: CacheEntry,
    sessionId?: string,
    userId?: string,
    requestId?: string
  ): boolean {
    // SYMMETRIC RULE 1: sessionId matching
    // Both must have sessionId OR both must NOT have sessionId
    const entryHasSession = !!entry.sessionId;
    const requestHasSession = !!sessionId;

    if (entryHasSession !== requestHasSession) {
      // Asymmetric: one has sessionId, the other doesn't
      logger.warn({
        requestId,
        event: 'idor_violation',
        reason: 'session_asymmetry',
        entryHasSession,
        requestHasSession,
        entrySessionHash: entry.sessionId ? hashSessionId(entry.sessionId) : null,
        requestSessionHash: sessionId ? hashSessionId(sessionId) : null
      }, '[RANKING_CACHE] IDOR violation - session asymmetry detected');
      return false;
    }

    // If both have sessionId, verify they match
    if (entryHasSession && entry.sessionId !== sessionId) {
      logger.warn({
        requestId,
        event: 'idor_violation',
        reason: 'session_mismatch',
        entrySessionHash: hashSessionId(entry.sessionId!),
        requestSessionHash: hashSessionId(sessionId!)
      }, '[RANKING_CACHE] IDOR violation - session mismatch');
      return false;
    }

    // SYMMETRIC RULE 2: userId matching (same logic)
    const entryHasUser = !!entry.userId;
    const requestHasUser = !!userId;

    if (entryHasUser !== requestHasUser) {
      // Asymmetric: one has userId, the other doesn't
      logger.warn({
        requestId,
        event: 'idor_violation',
        reason: 'user_asymmetry',
        entryHasUser,
        requestHasUser
      }, '[RANKING_CACHE] IDOR violation - user asymmetry detected');
      return false;
    }

    // If both have userId, verify they match
    if (entryHasUser && entry.userId !== userId) {
      logger.warn({
        requestId,
        event: 'idor_violation',
        reason: 'user_mismatch'
      }, '[RANKING_CACHE] IDOR violation - user mismatch');
      return false;
    }

    // All checks passed - symmetric match
    logger.debug({
      requestId,
      event: 'idor_check_passed',
      hasSession: entryHasSession,
      hasUser: entryHasUser
    }, '[RANKING_CACHE] Ownership verified (symmetric match)');

    return true;
  }

  /**
   * Clear cache entry (for testing)
   */
  async clear(requestId: string): Promise<void> {
    const redis = this.getRedis();
    if (!redis) return;

    try {
      const key = KEY_PREFIX + requestId;
      await redis.del(key);
    } catch (error) {
      // Ignore errors in test cleanup
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.getRedis() !== null;
  }

  /**
   * Get cache stats (for monitoring)
   */
  async getStats(): Promise<{ available: boolean; totalKeys?: number }> {
    const redis = this.getRedis();

    if (!redis) {
      return { available: false };
    }

    try {
      const pattern = KEY_PREFIX + '*';
      const keys = await redis.keys(pattern);
      return {
        available: true,
        totalKeys: keys.length
      };
    } catch (error) {
      return { available: false };
    }
  }
}

// Singleton instance
export const rankingSignalsCache = new RankingSignalsCacheRedis();
