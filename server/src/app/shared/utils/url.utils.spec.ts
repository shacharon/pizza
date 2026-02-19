/**
 * Unit tests for URL utilities
 */

import { joinUrl, normalizeUrl } from './url.utils';

describe('URL Utils', () => {
  describe('joinUrl', () => {
    it('should join base and path with trailing slashes', () => {
      const result = joinUrl('https://app.going2eat.food/', '/api/v1/search/req-123/result/');
      expect(result).toBe('https://app.going2eat.food/api/v1/search/req-123/result');
    });

    it('should join base with trailing slash and path without', () => {
      const result = joinUrl('https://api.example.com/', 'api/v1/search');
      expect(result).toBe('https://api.example.com/api/v1/search');
    });

    it('should join base without trailing slash and path with leading slash', () => {
      const result = joinUrl('/api/v1', '/search/req-123/result');
      expect(result).toBe('/api/v1/search/req-123/result');
    });

    it('should join base and path both without slashes', () => {
      const result = joinUrl('/api/v1', 'search');
      expect(result).toBe('/api/v1/search');
    });

    it('should handle multiple trailing slashes', () => {
      const result = joinUrl('https://api.example.com///', '///search///');
      expect(result).toBe('https://api.example.com/search');
    });

    it('should handle empty path', () => {
      const result = joinUrl('/api/v1/', '');
      expect(result).toBe('/api/v1');
    });

    it('should preserve protocol and domain', () => {
      const result = joinUrl('https://api.going2eat.food', '/api/v1/search');
      expect(result).toBe('https://api.going2eat.food/api/v1/search');
    });
  });

  describe('normalizeUrl', () => {
    it('should remove trailing slash', () => {
      const result = normalizeUrl('/api/v1/search/');
      expect(result).toBe('/api/v1/search');
    });

    it('should remove multiple trailing slashes', () => {
      const result = normalizeUrl('/api/v1/search///');
      expect(result).toBe('/api/v1/search');
    });

    it('should keep root slash', () => {
      const result = normalizeUrl('/');
      expect(result).toBe('/');
    });

    it('should handle URL without trailing slash', () => {
      const result = normalizeUrl('/api/v1/search');
      expect(result).toBe('/api/v1/search');
    });

    it('should handle absolute URLs', () => {
      const result = normalizeUrl('https://api.example.com/search/');
      expect(result).toBe('https://api.example.com/search');
    });
  });
});
