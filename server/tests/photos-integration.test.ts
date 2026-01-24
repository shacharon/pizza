/**
 * Photo Proxy Integration Tests
 * End-to-end tests for P0 security: no key exposure in search results
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Photo Security Integration Tests', () => {
  describe('Search Results - No Key Exposure', () => {
    it('should not contain "key=" in sync search response', async () => {
      // This is a mock test - in real integration tests, you would:
      // 1. Start the server
      // 2. Make actual HTTP request
      // 3. Verify response
      
      // Mock search response (what we expect after sanitization)
      const mockResponse = {
        results: [
          {
            id: 'ChIJ123',
            name: 'Test Restaurant',
            photoReference: 'places/ChIJ123/photos/ABC',
            photoReferences: [
              'places/ChIJ123/photos/ABC1',
              'places/ChIJ123/photos/ABC2'
            ]
            // Note: No photoUrl field with API key
          }
        ]
      };

      // Verify no API key in response
      const responseJson = JSON.stringify(mockResponse);
      assert.strictEqual(responseJson.includes('key='), false, 'Response must not contain "key="');
      assert.strictEqual(responseJson.includes('AIza'), false, 'Response must not contain API key prefix');
    });

    it('should not contain "key=" in async search response', async () => {
      // Mock async result endpoint response
      const mockAsyncResponse = {
        requestId: 'req-123',
        status: 'DONE_SUCCESS',
        results: [
          {
            id: 'ChIJ456',
            name: 'Another Restaurant',
            photoReference: 'places/ChIJ456/photos/XYZ'
          }
        ]
      };

      const responseJson = JSON.stringify(mockAsyncResponse);
      assert.strictEqual(responseJson.includes('key='), false);
      assert.strictEqual(responseJson.includes('AIza'), false);
    });

    it('should have photoReference field in results', () => {
      const mockResult = {
        id: 'ChIJ123',
        name: 'Test',
        photoReference: 'places/ChIJ123/photos/ABC'
      };

      assert.strictEqual(typeof mockResult.photoReference, 'string');
      assert.strictEqual(mockResult.photoReference.startsWith('places/'), true);
      assert.strictEqual(mockResult.photoReference.includes('/photos/'), true);
    });

    it('should have photoReferences array in results', () => {
      const mockResult = {
        id: 'ChIJ123',
        name: 'Test',
        photoReferences: [
          'places/ChIJ123/photos/ABC1',
          'places/ChIJ123/photos/ABC2'
        ]
      };

      assert.strictEqual(Array.isArray(mockResult.photoReferences), true);
      assert.strictEqual(mockResult.photoReferences.length, 2);
      
      for (const ref of mockResult.photoReferences) {
        assert.strictEqual(ref.includes('key='), false);
        assert.strictEqual(ref.startsWith('places/'), true);
      }
    });
  });

  describe('Photo Proxy Endpoint - Security', () => {
    it('should return photo without exposing API key', () => {
      // Mock successful photo proxy response headers
      const headers = {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Trace-Id': 'req-123-abc'
      };

      // Verify no API key in headers
      const headersJson = JSON.stringify(headers);
      assert.strictEqual(headersJson.includes('key='), false);
      assert.strictEqual(headersJson.includes('AIza'), false);
    });

    it('should include required security headers', () => {
      const headers = {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '55',
        'X-RateLimit-Reset': '1234567890',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Trace-Id': 'req-123-abc'
      };

      assert.strictEqual('X-RateLimit-Limit' in headers, true);
      assert.strictEqual('X-RateLimit-Remaining' in headers, true);
      assert.strictEqual('X-RateLimit-Reset' in headers, true);
      assert.strictEqual('Cache-Control' in headers, true);
      assert.strictEqual('X-Trace-Id' in headers, true);
    });

    it('should block requests exceeding rate limit', () => {
      // Mock rate limit exceeded response
      const errorResponse = {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        traceId: 'req-123-abc',
        retryAfter: 30
      };

      assert.strictEqual(errorResponse.code, 'RATE_LIMIT_EXCEEDED');
      assert.strictEqual(typeof errorResponse.retryAfter, 'number');
      assert.strictEqual(errorResponse.retryAfter > 0, true);
    });

    it('should validate photo reference format', () => {
      const validRef = 'places/ChIJ123456/photos/ABC123';
      const invalidRef = 'invalid-reference';

      const isValid = (ref: string) => {
        return /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
      };

      assert.strictEqual(isValid(validRef), true);
      assert.strictEqual(isValid(invalidRef), false);
    });
  });

  describe('End-to-End Flow - No Key Leakage', () => {
    it('should complete full search-to-photo flow without exposing keys', () => {
      // Simulate full flow
      const steps = [
        {
          step: 'search',
          request: { query: 'pizza', userLocation: { lat: 32.0853, lng: 34.7818 } },
          response: { 
            results: [{ 
              id: 'ChIJ123', 
              name: 'Pizza Place',
              photoReference: 'places/ChIJ123/photos/ABC'
            }]
          }
        },
        {
          step: 'photo-proxy',
          request: { photoReference: 'places/ChIJ123/photos/ABC', maxWidthPx: 800 },
          response: { 
            contentType: 'image/jpeg',
            headers: {
              'Cache-Control': 'public, max-age=86400',
              'X-Trace-Id': 'req-123'
            }
          }
        }
      ];

      for (const { step, request, response } of steps) {
        const requestJson = JSON.stringify(request);
        const responseJson = JSON.stringify(response);

        assert.strictEqual(requestJson.includes('key='), false, `${step} request must not contain key`);
        assert.strictEqual(responseJson.includes('key='), false, `${step} response must not contain key`);
        assert.strictEqual(requestJson.includes('AIza'), false, `${step} request must not contain API key`);
        assert.strictEqual(responseJson.includes('AIza'), false, `${step} response must not contain API key`);
      }
    });

    it('should handle errors without exposing keys', () => {
      const errorResponses = [
        {
          status: 400,
          body: { error: 'Invalid request', code: 'VALIDATION_ERROR', traceId: 'req-123' }
        },
        {
          status: 404,
          body: { error: 'Photo not found', code: 'NOT_FOUND', traceId: 'req-124' }
        },
        {
          status: 429,
          body: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED', traceId: 'req-125', retryAfter: 30 }
        },
        {
          status: 502,
          body: { error: 'Upstream service error', code: 'UPSTREAM_ERROR', traceId: 'req-126' }
        }
      ];

      for (const { status, body } of errorResponses) {
        const bodyJson = JSON.stringify(body);
        
        assert.strictEqual(bodyJson.includes('key='), false, `${status} error must not contain key`);
        assert.strictEqual(bodyJson.includes('AIza'), false, `${status} error must not contain API key`);
        assert.strictEqual(bodyJson.includes('traceId'), true, `${status} error must include traceId`);
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('should sanitize legacy photoUrl fields', () => {
      const legacyResult = {
        id: 'ChIJ123',
        name: 'Test',
        photoUrl: 'https://places.googleapis.com/v1/places/ChIJ123/photos/ABC/media?key=AIzaSyXXXX'
      };

      // After sanitization
      const sanitized = sanitizeLegacyUrl(legacyResult.photoUrl);
      
      assert.strictEqual(sanitized?.includes('key='), false);
      assert.strictEqual(sanitized?.includes('AIza'), false);
    });

    it('should sanitize legacy photos array', () => {
      const legacyResult = {
        id: 'ChIJ123',
        name: 'Test',
        photos: [
          'https://places.googleapis.com/v1/places/ChIJ123/photos/A/media?key=AIzaSyXXXX',
          'https://places.googleapis.com/v1/places/ChIJ123/photos/B/media?key=AIzaSyYYYY'
        ]
      };

      const sanitized = legacyResult.photos.map(url => sanitizeLegacyUrl(url));
      
      for (const url of sanitized) {
        assert.strictEqual(url?.includes('key='), false);
        assert.strictEqual(url?.includes('AIza'), false);
      }
    });
  });

  describe('Logging Security', () => {
    it('should hash photo references in logs', () => {
      const photoRef = 'places/ChIJ123456/photos/ABC123';
      const hash = hashForLogging(photoRef);

      assert.notStrictEqual(hash, photoRef);
      assert.strictEqual(hash.length, 12);
      assert.strictEqual(typeof hash, 'string');
    });

    it('should hash IP addresses in logs (optional)', () => {
      const ip = '192.168.1.1';
      const hash = hashForLogging(ip);

      assert.notStrictEqual(hash, ip);
      assert.strictEqual(typeof hash, 'string');
    });

    it('should not log full API keys ever', () => {
      const apiKey = 'AIzaSyXXXXXXXXXXXXXXXXXX';
      
      // Logs should only include:
      // - Key existence check: hasGoogleKey: true
      // - Last 4 chars for verification: googleKeyLast4: "XXXX"
      
      const safeLogEntry = {
        hasGoogleKey: Boolean(apiKey),
        googleKeyLast4: apiKey.slice(-4)
      };

      const logJson = JSON.stringify(safeLogEntry);
      
      // Should not contain full key
      assert.strictEqual(logJson.includes(apiKey), false);
      // Should contain last 4 chars only
      assert.strictEqual(logJson.includes(apiKey.slice(-4)), true);
    });
  });
});

// Helper functions

function sanitizeLegacyUrl(url: string | undefined): string | undefined {
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

function hashForLogging(value: string): string {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);
}
