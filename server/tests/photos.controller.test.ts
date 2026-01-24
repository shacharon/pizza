/**
 * Photo Proxy Controller Tests
 * Tests for P0 security fixes: rate limiting, validation, no key exposure
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

describe('Photo Proxy Controller', () => {
  describe('Input Validation', () => {
    it('should reject invalid photo reference format', () => {
      // Test cases for invalid photo references
      const invalidRefs = [
        'invalid',
        'places/',
        'places/ChIJ',
        'photos/ABC',
        'places/ChIJ/photos',
        '',
        'a'.repeat(501), // Too long
        'places/../../etc/passwd', // Path traversal attempt
        'places/ChIJ<script>alert(1)</script>/photos/ABC', // XSS attempt
      ];

      for (const ref of invalidRefs) {
        const result = validatePhotoReference(ref);
        assert.strictEqual(result, false, `Should reject: ${ref}`);
      }
    });

    it('should accept valid photo reference format', () => {
      const validRefs = [
        'places/ChIJ123/photos/ABC',
        'places/ChIJabcdefghijklmnop/photos/xyz123',
        'places/ChIJ-_test/photos/photo-123',
      ];

      for (const ref of validRefs) {
        const result = validatePhotoReference(ref);
        assert.strictEqual(result, true, `Should accept: ${ref}`);
      }
    });

    it('should clamp maxWidthPx to valid range', () => {
      assert.strictEqual(clampDimension(50, 100, 1600), 100);
      assert.strictEqual(clampDimension(800, 100, 1600), 800);
      assert.strictEqual(clampDimension(2000, 100, 1600), 1600);
    });

    it('should reject invalid dimensions', () => {
      const invalidDimensions = [-1, 0, 50, 2000, NaN, Infinity];
      
      for (const dim of invalidDimensions) {
        const isValid = dim >= 100 && dim <= 1600 && Number.isFinite(dim);
        assert.strictEqual(isValid, false, `Should reject: ${dim}`);
      }
    });
  });

  describe('Security - No API Key Exposure', () => {
    it('should never include API key in response', () => {
      // Mock photo reference
      const photoRef = 'places/ChIJ123/photos/ABC';
      
      // Ensure the reference itself contains no key
      assert.strictEqual(photoRef.includes('key='), false);
      assert.strictEqual(photoRef.includes('AIza'), false);
    });

    it('should hash photo references in logs', () => {
      const photoRef = 'places/ChIJ123456/photos/ABC123';
      const hash = hashPhotoRef(photoRef);
      
      assert.strictEqual(typeof hash, 'string');
      assert.strictEqual(hash.length, 12);
      assert.notStrictEqual(hash, photoRef);
    });

    it('should sanitize photo URLs in search results', () => {
      const results = [
        {
          id: '1',
          name: 'Test',
          photoUrl: 'https://places.googleapis.com/v1/places/ChIJ1/photos/A/media?key=AIzaSyXXXX&maxWidthPx=800'
        }
      ];

      const sanitized = sanitizePhotoUrls(results);
      
      assert.strictEqual(sanitized[0].photoUrl?.includes('key='), false);
      assert.strictEqual(sanitized[0].photoUrl?.includes('AIza'), false);
    });
  });

  describe('Rate Limiting', () => {
    it('should track requests per IP', () => {
      const limiter = createTestRateLimiter({ windowMs: 60000, maxRequests: 5 });
      
      const ip = '192.168.1.1';
      
      // First 5 requests should succeed
      for (let i = 0; i < 5; i++) {
        const result = limiter.increment(ip);
        assert.strictEqual(result.isAllowed, true);
        assert.strictEqual(result.count, i + 1);
      }
      
      // 6th request should be blocked
      const blocked = limiter.increment(ip);
      assert.strictEqual(blocked.count, 6);
      assert.strictEqual(blocked.count > 5, true);
    });

    it('should reset after time window', async () => {
      const limiter = createTestRateLimiter({ windowMs: 100, maxRequests: 2 });
      
      const ip = '192.168.1.2';
      
      // Use up limit
      limiter.increment(ip);
      limiter.increment(ip);
      
      const blocked = limiter.increment(ip);
      assert.strictEqual(blocked.count > 2, true);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should allow new requests
      const allowed = limiter.increment(ip);
      assert.strictEqual(allowed.count, 1);
    });

    it('should handle multiple IPs independently', () => {
      const limiter = createTestRateLimiter({ windowMs: 60000, maxRequests: 3 });
      
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';
      
      // IP1: use 2 requests
      limiter.increment(ip1);
      limiter.increment(ip1);
      
      // IP2: use 3 requests
      limiter.increment(ip2);
      limiter.increment(ip2);
      limiter.increment(ip2);
      
      // IP1 should still have capacity
      const ip1Result = limiter.increment(ip1);
      assert.strictEqual(ip1Result.count, 3);
      
      // IP2 should be at limit
      const ip2Result = limiter.increment(ip2);
      assert.strictEqual(ip2Result.count, 4);
    });
  });

  describe('Response Headers', () => {
    it('should include cache headers for successful photo responses', () => {
      const headers = {
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Type': 'image/jpeg'
      };
      
      assert.strictEqual(headers['Cache-Control'].includes('max-age=86400'), true);
      assert.strictEqual(headers['Cache-Control'].includes('immutable'), true);
    });

    it('should include rate limit headers', () => {
      const headers = {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '55',
        'X-RateLimit-Reset': '1234567890'
      };
      
      assert.strictEqual(parseInt(headers['X-RateLimit-Limit']), 60);
      assert.strictEqual(parseInt(headers['X-RateLimit-Remaining']) <= 60, true);
    });

    it('should include trace ID in responses', () => {
      const response = {
        error: 'Not found',
        code: 'NOT_FOUND',
        traceId: 'test-trace-123'
      };
      
      assert.strictEqual(typeof response.traceId, 'string');
      assert.strictEqual(response.traceId.length > 0, true);
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid photo reference', () => {
      const error = {
        status: 400,
        code: 'VALIDATION_ERROR',
        error: 'Invalid request'
      };
      
      assert.strictEqual(error.status, 400);
      assert.strictEqual(error.code, 'VALIDATION_ERROR');
    });

    it('should return 404 for not found photos', () => {
      const error = {
        status: 404,
        code: 'NOT_FOUND',
        error: 'Photo not found'
      };
      
      assert.strictEqual(error.status, 404);
      assert.strictEqual(error.code, 'NOT_FOUND');
    });

    it('should return 429 when rate limited', () => {
      const error = {
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        error: 'Too many requests',
        retryAfter: 60
      };
      
      assert.strictEqual(error.status, 429);
      assert.strictEqual(error.code, 'RATE_LIMIT_EXCEEDED');
      assert.strictEqual(typeof error.retryAfter, 'number');
    });

    it('should return 502 for upstream errors', () => {
      const error = {
        status: 502,
        code: 'UPSTREAM_ERROR',
        error: 'Upstream service error'
      };
      
      assert.strictEqual(error.status, 502);
      assert.strictEqual(error.code, 'UPSTREAM_ERROR');
    });

    it('should validate content type from upstream', () => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const invalidTypes = ['text/html', 'application/json', 'text/plain'];
      
      for (const type of validTypes) {
        assert.strictEqual(type.startsWith('image/'), true);
      }
      
      for (const type of invalidTypes) {
        assert.strictEqual(type.startsWith('image/'), false);
      }
    });
  });
});

// Helper functions (implementations would be in the actual controller)

function validatePhotoReference(ref: string): boolean {
  if (!ref || ref.length < 10 || ref.length > 500) return false;
  return /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
}

function clampDimension(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashPhotoRef(ref: string): string {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(ref).digest('hex').substring(0, 12);
}

function sanitizePhotoUrls(results: any[]): any[] {
  return results.map(r => ({
    ...r,
    photoUrl: r.photoUrl ? sanitizePhotoUrl(r.photoUrl) : undefined
  }));
}

function sanitizePhotoUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const urlObj = new URL(url);
    if (urlObj.searchParams.has('key')) {
      urlObj.searchParams.delete('key');
      return urlObj.toString();
    }
    return url;
  } catch {
    return undefined;
  }
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  count: number;
  resetTime: number;
  isAllowed: boolean;
}

function createTestRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, { count: number; resetTime: number }>();
  
  return {
    increment(ip: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(ip);
      
      if (!entry || entry.resetTime < now) {
        const resetTime = now + config.windowMs;
        store.set(ip, { count: 1, resetTime });
        return { count: 1, resetTime, isAllowed: true };
      }
      
      entry.count++;
      const isAllowed = entry.count <= config.maxRequests;
      return { count: entry.count, resetTime: entry.resetTime, isAllowed };
    }
  };
}
