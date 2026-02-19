/**
 * Lock Service Tests
 * Unit tests for Redis-based distributed locking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis as RedisClient } from 'ioredis';
import { tryAcquireLock, releaseLock, type LockResult } from '../lock-service.js';

describe('lock-service', () => {
  let mockRedis: RedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = {
      set: vi.fn(),
      del: vi.fn(),
    } as any;
  });

  describe('tryAcquireLock', () => {
    it('should acquire lock when key does not exist (SET NX returns OK)', async () => {
      (mockRedis.set as any).mockResolvedValue('OK');

      const result = await tryAcquireLock(
        mockRedis,
        'wolt:lock:place123',
        300,
        'wolt',
        'place123'
      );

      expect(result).toEqual({
        acquired: true,
        reason: 'acquired',
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'wolt:lock:place123',
        '1',
        'EX',
        300,
        'NX'
      );
    });

    it('should fail to acquire lock when key already exists (SET NX returns null)', async () => {
      (mockRedis.set as any).mockResolvedValue(null);

      const result = await tryAcquireLock(
        mockRedis,
        'wolt:lock:place456',
        300,
        'wolt',
        'place456'
      );

      expect(result).toEqual({
        acquired: false,
        reason: 'held',
      });
    });

    it('should handle Redis errors gracefully', async () => {
      const redisError = new Error('Redis connection timeout');
      (mockRedis.set as any).mockRejectedValue(redisError);

      const result = await tryAcquireLock(
        mockRedis,
        'wolt:lock:place789',
        300,
        'wolt',
        'place789'
      );

      expect(result).toEqual({
        acquired: false,
        reason: 'error',
        error: 'Redis connection timeout',
      });
    });

    it('should use correct TTL from parameter', async () => {
      (mockRedis.set as any).mockResolvedValue('OK');

      await tryAcquireLock(
        mockRedis,
        'tenbis:lock:place999',
        600, // Different TTL
        'tenbis',
        'place999'
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'tenbis:lock:place999',
        '1',
        'EX',
        600, // Verify TTL parameter
        'NX'
      );
    });

    it('should be idempotent - second call returns held', async () => {
      // First call: acquired
      (mockRedis.set as any).mockResolvedValueOnce('OK');
      const result1 = await tryAcquireLock(
        mockRedis,
        'wolt:lock:place111',
        300,
        'wolt',
        'place111'
      );

      expect(result1.acquired).toBe(true);

      // Second call: held (idempotency)
      (mockRedis.set as any).mockResolvedValueOnce(null);
      const result2 = await tryAcquireLock(
        mockRedis,
        'wolt:lock:place111',
        300,
        'wolt',
        'place111'
      );

      expect(result2.acquired).toBe(false);
      expect(result2.reason).toBe('held');
    });
  });

  describe('releaseLock', () => {
    it('should delete lock key on release', async () => {
      (mockRedis.del as any).mockResolvedValue(1);

      await releaseLock(
        mockRedis,
        'wolt:lock:place123',
        'wolt',
        'place123'
      );

      expect(mockRedis.del).toHaveBeenCalledWith('wolt:lock:place123');
    });

    it('should handle Redis errors gracefully on release', async () => {
      const redisError = new Error('Redis connection lost');
      (mockRedis.del as any).mockRejectedValue(redisError);

      // Should not throw
      await expect(
        releaseLock(mockRedis, 'wolt:lock:place456', 'wolt', 'place456')
      ).resolves.toBeUndefined();

      expect(mockRedis.del).toHaveBeenCalledWith('wolt:lock:place456');
    });

    it('should handle release of non-existent lock', async () => {
      (mockRedis.del as any).mockResolvedValue(0); // Key did not exist

      await releaseLock(
        mockRedis,
        'wolt:lock:nonexistent',
        'wolt',
        'nonexistent'
      );

      expect(mockRedis.del).toHaveBeenCalledWith('wolt:lock:nonexistent');
    });
  });
});
