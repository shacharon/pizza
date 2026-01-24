/**
 * Photo Source Utility Tests
 * P0 Security: Verify no API key exposure in photo URLs
 */

import { buildPhotoSrc, getPhotoPlaceholder, buildPhotoSrcset } from './photo-src.util';
import type { Restaurant } from '../domain/types/search.types';

describe('PhotoSrcUtil - P0 Security', () => {
  const mockRestaurantBase: Restaurant = {
    id: 'test-1',
    placeId: 'ChIJ123',
    name: 'Test Restaurant',
    address: '123 Test St',
    location: { lat: 32.0853, lng: 34.7818 }
  };

  describe('buildPhotoSrc', () => {
    it('should return internal proxy URL when photoReference is provided', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/ABC456'
      };

      const result = buildPhotoSrc(restaurant);

      expect(result).toBeTruthy();
      expect(result).toContain('/api/v1/photos/');
      expect(result).toContain('places/ChIJ123/photos/ABC456');
      expect(result).toContain('maxWidthPx=400');
      expect(result).not.toContain('key=');
      expect(result).not.toContain('AIza');
      expect(result).not.toContain('places.googleapis.com');
    });

    it('should return null when no photo data is available', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase
      };

      const result = buildPhotoSrc(restaurant);

      expect(result).toBeNull();
    });

    it('should never return URL containing "key=" parameter', () => {
      const testCases: Restaurant[] = [
        {
          ...mockRestaurantBase,
          photoReference: 'places/ChIJ123/photos/ABC'
        },
        {
          ...mockRestaurantBase,
          photoReference: 'places/ChIJ456/photos/XYZ'
        }
      ];

      for (const restaurant of testCases) {
        const result = buildPhotoSrc(restaurant);
        if (result) {
          expect(result).not.toContain('key=');
        }
      }
    });

    it('should never return URL containing "AIza" (Google API key prefix)', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/ABC'
      };

      const result = buildPhotoSrc(restaurant);

      expect(result).toBeTruthy();
      expect(result).not.toContain('AIza');
    });

    it('should never return URL to places.googleapis.com', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/ABC'
      };

      const result = buildPhotoSrc(restaurant);

      expect(result).toBeTruthy();
      expect(result).not.toContain('places.googleapis.com');
      expect(result).not.toContain('googleapis.com');
    });

    it('should respect custom maxWidthPx parameter', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/ABC'
      };

      const result = buildPhotoSrc(restaurant, 1200);

      expect(result).toContain('maxWidthPx=1200');
    });

    it('should ONLY use photoReference and ignore photoUrl completely', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/NEW',
        photoUrl: 'https://old-url.com/photo.jpg'
      };

      const result = buildPhotoSrc(restaurant);

      // CRITICAL: Should ONLY use photoReference, never photoUrl
      expect(result).toContain('places/ChIJ123/photos/NEW');
      expect(result).toContain('/api/v1/photos/');
      expect(result).not.toContain('old-url.com');
    });

    it('should return null when only photoUrl exists (no photoReference)', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoUrl: 'https://example.com/photo.jpg'
      };

      const result = buildPhotoSrc(restaurant);

      // CRITICAL: Should return null, not use photoUrl
      expect(result).toBeNull();
    });

    it('should handle missing photo gracefully', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: undefined,
        photoUrl: undefined
      };

      const result = buildPhotoSrc(restaurant);

      expect(result).toBeNull();
    });

    it('should handle array of photo references (use first one)', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/FIRST',
        photoReferences: [
          'places/ChIJ123/photos/FIRST',
          'places/ChIJ123/photos/SECOND'
        ]
      };

      const result = buildPhotoSrc(restaurant);

      expect(result).toContain('places/ChIJ123/photos/FIRST');
    });
  });

  describe('getPhotoPlaceholder', () => {
    it('should return a valid data URI', () => {
      const placeholder = getPhotoPlaceholder();

      expect(placeholder).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should be a non-empty string', () => {
      const placeholder = getPhotoPlaceholder();

      expect(placeholder.length).toBeGreaterThan(0);
    });
  });

  describe('buildPhotoSrcset', () => {
    it('should return srcset with multiple sizes', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/ABC'
      };

      const result = buildPhotoSrcset(restaurant);

      expect(result).toBeTruthy();
      expect(result).toContain('400w');
      expect(result).toContain('800w');
      expect(result).toContain('1200w');
      expect(result).not.toContain('key=');
    });

    it('should return null when no photo reference', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase
      };

      const result = buildPhotoSrcset(restaurant);

      expect(result).toBeNull();
    });
  });

  describe('Security Regression Tests', () => {
    it('should NEVER accept direct Google Places URLs in photoUrl', () => {
      // CRITICAL: Even if backend accidentally sends photoUrl with Google URL, ignore it
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoUrl: 'https://places.googleapis.com/v1/places/ChIJ123/photos/ABC/media?key=AIzaSyXXXX'
      };

      const result = buildPhotoSrc(restaurant);
      
      // Should return null (no photoReference), never use photoUrl
      expect(result).toBeNull();
    });

    it('should ignore photoUrl even if it looks safe', () => {
      const urlsToIgnore = [
        'https://example.com/photo.jpg',
        'https://api.test.com/image?maxWidth=800',
        '/some/local/path/photo.jpg'
      ];

      for (const url of urlsToIgnore) {
        const restaurant: Restaurant = {
          ...mockRestaurantBase,
          photoUrl: url
        };

        const result = buildPhotoSrc(restaurant);
        
        // CRITICAL: Should return null, NEVER use photoUrl
        expect(result).toBeNull();
      }
    });

    it('should build safe URLs for all valid photo references', () => {
      const validReferences = [
        'places/ChIJ123/photos/ABC',
        'places/ChIJabcdef123456/photos/xyz789',
        'places/ChIJ-test_123/photos/photo-456'
      ];

      for (const ref of validReferences) {
        const restaurant: Restaurant = {
          ...mockRestaurantBase,
          photoReference: ref
        };

        const result = buildPhotoSrc(restaurant);

        expect(result).toBeTruthy();
        expect(result).toContain('/api/v1/photos/');
        expect(result).toContain(ref);
        expect(result).not.toContain('key=');
        expect(result).not.toContain('AIza');
      }
    });
  });

  describe('URL Format Validation', () => {
    it('should build URLs with correct structure', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/ABC'
      };

      const result = buildPhotoSrc(restaurant);

      expect(result).toMatch(/^http:\/\/localhost:3000\/api\/v1\/photos\/places\/[^/]+\/photos\/[^?]+\?maxWidthPx=400$/);
    });

    it('should URL-encode special characters if needed', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: 'places/ChIJ123/photos/ABC'
      };

      const result = buildPhotoSrc(restaurant);

      // Should not have unencoded special chars (except /, :, ?, =, &)
      expect(result).not.toMatch(/[<>"'{}|\\^`\[\]]/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty photoReference', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: ''
      };

      const result = buildPhotoSrc(restaurant);

      // Empty string is falsy, should be treated as no photo
      expect(result).toBeNull();
    });

    it('should handle very long photo references', () => {
      const longRef = 'places/' + 'a'.repeat(500) + '/photos/' + 'b'.repeat(500);
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: longRef
      };

      const result = buildPhotoSrc(restaurant);

      expect(result).toBeTruthy();
      expect(result).toContain(longRef);
      expect(result).not.toContain('key=');
    });

    it('should handle null/undefined restaurant properties gracefully', () => {
      const restaurant: Restaurant = {
        ...mockRestaurantBase,
        photoReference: undefined,
        photoUrl: undefined,
        photoReferences: undefined
      };

      expect(() => buildPhotoSrc(restaurant)).not.toThrow();
      expect(buildPhotoSrc(restaurant)).toBeNull();
    });
  });
});
