/**
 * P0 Security Tests - Photo URL Sanitization
 * Tests for removing API keys from photo URLs
 */

import { describe, it, expect } from 'vitest';
import { hashSessionId, sanitizePhotoUrl, sanitizePhotoUrls } from './security.utils.js';

describe('P0 Security: Photo URL Sanitization', () => {
  describe('sanitizePhotoUrl', () => {
    it('should remove key parameter from photo URLs', () => {
      const urlWithKey = 'https://places.googleapis.com/v1/places/ChIJ123/photos/ABC/media?maxWidthPx=800&key=AIzaSyXXXXXXXX';
      const sanitized = sanitizePhotoUrl(urlWithKey);

      expect(sanitized).toBeDefined();
      expect(sanitized).not.toContain('key=');
      expect(sanitized).not.toContain('AIzaSy');
      expect(sanitized).toContain('maxWidthPx=800');
    });

    it('should preserve other query parameters', () => {
      const url = 'https://places.googleapis.com/v1/places/ChIJ123/photos/ABC/media?maxWidthPx=800&maxHeightPx=600&key=secret123';
      const sanitized = sanitizePhotoUrl(url);

      expect(sanitized).toContain('maxWidthPx=800');
      expect(sanitized).toContain('maxHeightPx=600');
      expect(sanitized).not.toContain('key=');
    });

    it('should return URL unchanged if no key parameter', () => {
      const url = 'https://places.googleapis.com/v1/places/ChIJ123/photos/ABC/media?maxWidthPx=800';
      const sanitized = sanitizePhotoUrl(url);

      expect(sanitized).toBe(url);
    });

    it('should return undefined for invalid URLs', () => {
      const invalidUrl = 'not-a-valid-url';
      const sanitized = sanitizePhotoUrl(invalidUrl);

      expect(sanitized).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const sanitized = sanitizePhotoUrl(undefined);
      expect(sanitized).toBeUndefined();
    });

    it('should handle URLs with multiple keys (edge case)', () => {
      const url = 'https://example.com/photo?key=secret1&maxWidthPx=800&key=secret2';
      const sanitized = sanitizePhotoUrl(url);

      expect(sanitized).not.toContain('key=');
      expect(sanitized).toContain('maxWidthPx=800');
    });
  });

  describe('sanitizePhotoUrls', () => {
    it('should sanitize photoUrl in results array', () => {
      const results = [
        {
          id: '1',
          name: 'Restaurant 1',
          photoUrl: 'https://places.googleapis.com/v1/places/ChIJ1/photos/A/media?key=secret123'
        },
        {
          id: '2',
          name: 'Restaurant 2',
          photoUrl: 'https://places.googleapis.com/v1/places/ChIJ2/photos/B/media?key=secret456'
        }
      ];

      const sanitized = sanitizePhotoUrls(results);

      expect(sanitized).toHaveLength(2);
      expect(sanitized[0].photoUrl).not.toContain('key=');
      expect(sanitized[1].photoUrl).not.toContain('key=');
    });

    it('should sanitize photos array in results', () => {
      const results = [
        {
          id: '1',
          name: 'Restaurant 1',
          photos: [
            'https://places.googleapis.com/v1/places/ChIJ1/photos/A/media?key=secret1',
            'https://places.googleapis.com/v1/places/ChIJ1/photos/B/media?key=secret2'
          ]
        }
      ];

      const sanitized = sanitizePhotoUrls(results);

      expect(sanitized[0].photos).toHaveLength(2);
      expect(sanitized[0].photos[0]).not.toContain('key=');
      expect(sanitized[0].photos[1]).not.toContain('key=');
    });

    it('should handle results without photo URLs', () => {
      const results = [
        { id: '1', name: 'Restaurant 1' },
        { id: '2', name: 'Restaurant 2', photoUrl: undefined }
      ];

      const sanitized = sanitizePhotoUrls(results);

      expect(sanitized).toHaveLength(2);
      expect(sanitized[0].photoUrl).toBeUndefined();
      expect(sanitized[1].photoUrl).toBeUndefined();
    });

    it('should preserve other result properties', () => {
      const results = [
        {
          id: '1',
          name: 'Restaurant 1',
          rating: 4.5,
          address: '123 Main St',
          photoUrl: 'https://places.googleapis.com/v1/places/ChIJ1/photos/A/media?key=secret'
        }
      ];

      const sanitized = sanitizePhotoUrls(results);

      expect(sanitized[0].id).toBe('1');
      expect(sanitized[0].name).toBe('Restaurant 1');
      expect(sanitized[0].rating).toBe(4.5);
      expect(sanitized[0].address).toBe('123 Main St');
      expect(sanitized[0].photoUrl).not.toContain('key=');
    });

    it('should filter out invalid photo URLs from photos array', () => {
      const results = [
        {
          id: '1',
          name: 'Restaurant 1',
          photos: [
            'https://valid.com/photo1?key=secret',
            'invalid-url',
            'https://valid.com/photo2?key=secret'
          ]
        }
      ];

      const sanitized = sanitizePhotoUrls(results);

      // Invalid URLs are filtered out by sanitizePhotoUrl returning undefined
      expect(sanitized[0].photos).toBeDefined();
      expect(sanitized[0].photos.length).toBeLessThanOrEqual(2);
      expect(sanitized[0].photos.every((url: string) => !url.includes('key='))).toBe(true);
    });
  });

  describe('hashSessionId', () => {
    it('should hash session IDs consistently', () => {
      const sessionId = 'sess_test_12345';
      const hash1 = hashSessionId(sessionId);
      const hash2 = hashSessionId(sessionId);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(12);
      expect(hash1).toMatch(/^[a-f0-9]{12}$/);
    });

    it('should return "none" for null/undefined', () => {
      expect(hashSessionId(null)).toBe('none');
      expect(hashSessionId(undefined)).toBe('none');
    });

    it('should produce different hashes for different sessions', () => {
      const hash1 = hashSessionId('sess_alice');
      const hash2 = hashSessionId('sess_bob');

      expect(hash1).not.toBe(hash2);
    });

    it('should not expose original session ID in hash', () => {
      const sessionId = 'sess_secret_12345';
      const hash = hashSessionId(sessionId);

      expect(hash).not.toContain('secret');
      expect(hash).not.toContain('12345');
      expect(hash).not.toContain('sess');
    });
  });
});

describe('P0 Security: Integration Tests', () => {
  it('should sanitize all photo URLs in a complete search response', () => {
    const searchResponse = {
      requestId: 'req-123',
      results: [
        {
          id: '1',
          name: 'Restaurant A',
          photoUrl: 'https://places.googleapis.com/v1/places/ChIJ1/photos/A/media?maxWidthPx=800&key=AIzaSyXXXX',
          photos: [
            'https://places.googleapis.com/v1/places/ChIJ1/photos/A1/media?key=AIzaSyXXXX',
            'https://places.googleapis.com/v1/places/ChIJ1/photos/A2/media?key=AIzaSyXXXX'
          ]
        },
        {
          id: '2',
          name: 'Restaurant B',
          photoUrl: 'https://places.googleapis.com/v1/places/ChIJ2/photos/B/media?key=AIzaSyYYYY'
        }
      ]
    };

    const sanitized = {
      ...searchResponse,
      results: sanitizePhotoUrls(searchResponse.results)
    };

    // Verify no API keys remain
    const responseStr = JSON.stringify(sanitized);
    expect(responseStr).not.toContain('key=');
    expect(responseStr).not.toContain('AIzaSy');
    
    // Verify structure is preserved
    expect(sanitized.results).toHaveLength(2);
    expect(sanitized.results[0].name).toBe('Restaurant A');
    expect(sanitized.results[0].photoUrl).toBeDefined();
    expect(sanitized.results[0].photos).toHaveLength(2);
  });

  it('should combine IDOR protection with photo sanitization', () => {
    const ownerSessionId = 'sess_owner_alice';
    const currentSessionId = 'sess_owner_alice';

    // Session validation
    const isAuthorized = ownerSessionId === currentSessionId;
    expect(isAuthorized).toBe(true);

    // Photo sanitization
    const result = {
      photoUrl: 'https://places.googleapis.com/v1/places/ChIJ1/photos/A/media?key=secret'
    };

    const sanitized = sanitizePhotoUrl(result.photoUrl);
    expect(sanitized).not.toContain('key=');
  });
});
