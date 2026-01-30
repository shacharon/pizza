/**
 * Navigation Utilities - Unit Tests
 */

import { 
  buildNavigationUrl, 
  isMobileDevice, 
  buildDirectionsUrl, 
  buildPlaceUrl, 
  buildPhoneUrl,
  type NavigationDestination
} from './navigation.util';

describe('Navigation Utilities', () => {
  describe('buildNavigationUrl (Primary API)', () => {
    const testPlaceId = 'ChIJH3w7GaZMHRURkD-WwKJy-8E';
    const testLat = 32.0853;
    const testLng = 34.7818;

    it('should build URL with placeId only', () => {
      const url = buildNavigationUrl({ placeId: testPlaceId });

      expect(url).toBe(`https://maps.google.com/?q=place_id:${testPlaceId}`);
    });

    it('should build URL with coordinates only', () => {
      const url = buildNavigationUrl({ lat: testLat, lng: testLng });

      expect(url).toBe(`https://maps.google.com/?q=${testLat},${testLng}`);
    });

    it('should prioritize placeId when both provided', () => {
      const url = buildNavigationUrl({ 
        placeId: testPlaceId, 
        lat: testLat, 
        lng: testLng 
      });

      expect(url).toBe(`https://maps.google.com/?q=place_id:${testPlaceId}`);
      expect(url).not.toContain(`${testLat}`);
    });

    it('should throw error when no location data provided', () => {
      expect(() => buildNavigationUrl({})).toThrow('Must provide either placeId or coordinates');
    });

    it('should throw error when only lat provided', () => {
      expect(() => buildNavigationUrl({ lat: testLat })).toThrow();
    });

    it('should throw error when only lng provided', () => {
      expect(() => buildNavigationUrl({ lng: testLng })).toThrow();
    });

    it('should handle negative coordinates (Southern hemisphere)', () => {
      const url = buildNavigationUrl({ lat: -33.8688, lng: 151.2093 }); // Sydney

      expect(url).toBe('https://maps.google.com/?q=-33.8688,151.2093');
    });

    it('should handle high-precision coordinates', () => {
      const url = buildNavigationUrl({ lat: 32.085300123, lng: 34.781800456 });

      expect(url).toContain('32.085300123,34.781800456');
    });

    it('should handle zero coordinates (equator/prime meridian)', () => {
      const url = buildNavigationUrl({ lat: 0, lng: 0 });

      expect(url).toBe('https://maps.google.com/?q=0,0');
    });

    it('should create universal URL that works on desktop and mobile', () => {
      const url = buildNavigationUrl({ placeId: testPlaceId });

      // Universal format (no device detection needed)
      expect(url).toContain('maps.google.com');
      expect(url).not.toContain('api=1'); // Not needed for universal URL
      expect(url).not.toContain('dir'); // Not directions-specific
    });
  });

  describe('isMobileDevice', () => {
    it('should detect mobile device from user agent', () => {
      // Mock mobile user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });

      expect(isMobileDevice()).toBe(true);
    });

    it('should detect desktop device from user agent', () => {
      // Mock desktop user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: true
      });

      expect(isMobileDevice()).toBe(false);
    });

    it('should detect Android device', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 11; Pixel 5)',
        configurable: true
      });

      expect(isMobileDevice()).toBe(true);
    });
  });

  describe('buildDirectionsUrl (Legacy API)', () => {
    const testLocation = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv
    const testPlaceId = 'ChIJH3w7GaZMHRURkD-WwKJy-8E';

    it('should build desktop directions URL with coordinates only', () => {
      const url = buildDirectionsUrl(testLocation, undefined, false);

      expect(url).toContain('google.com/maps/dir/?');
      expect(url).toContain('api=1');
      expect(url).toContain(`destination=${testLocation.lat}%2C${testLocation.lng}`);
    });

    it('should build desktop directions URL with placeId', () => {
      const url = buildDirectionsUrl(testLocation, testPlaceId, false);

      expect(url).toContain('google.com/maps/dir/?');
      expect(url).toContain('api=1');
      expect(url).toContain(`destination=${testLocation.lat}%2C${testLocation.lng}`);
      expect(url).toContain(`destination_place_id=${testPlaceId}`);
    });

    it('should build mobile deep-link URL with placeId', () => {
      const url = buildDirectionsUrl(testLocation, testPlaceId, true);

      expect(url).toBe(`https://maps.google.com/?q=place_id:${testPlaceId}`);
    });

    it('should build mobile deep-link URL with coordinates fallback', () => {
      const url = buildDirectionsUrl(testLocation, undefined, true);

      expect(url).toBe(`https://maps.google.com/?q=${testLocation.lat},${testLocation.lng}`);
    });

    it('should handle negative coordinates correctly', () => {
      const location = { lat: -33.8688, lng: 151.2093 }; // Sydney
      const url = buildDirectionsUrl(location, undefined, false);

      expect(url).toContain(`destination=${location.lat}%2C${location.lng}`);
    });

    it('should handle high-precision coordinates', () => {
      const location = { lat: 32.085300123, lng: 34.781800456 };
      const url = buildDirectionsUrl(location, undefined, true);

      expect(url).toContain(`${location.lat},${location.lng}`);
    });
  });

  describe('buildPlaceUrl', () => {
    it('should build Google Maps place URL', () => {
      const placeId = 'ChIJH3w7GaZMHRURkD-WwKJy-8E';
      const url = buildPlaceUrl(placeId);

      expect(url).toBe(`https://www.google.com/maps/place/?q=place_id:${placeId}`);
    });
  });

  describe('buildPhoneUrl', () => {
    it('should build tel: URL with cleaned phone number', () => {
      const phone = '+972-3-123-4567';
      const url = buildPhoneUrl(phone);

      expect(url).toBe('tel:+972 3 123 4567');
    });

    it('should handle phone with parentheses', () => {
      const phone = '(03) 123-4567';
      const url = buildPhoneUrl(phone);

      expect(url).toBe('tel:03 123 4567');
    });

    it('should handle international format', () => {
      const phone = '+1 (555) 123-4567';
      const url = buildPhoneUrl(phone);

      expect(url).toBe('tel:+1 555 123 4567');
    });

    it('should remove non-numeric characters except + and spaces', () => {
      const phone = 'Call: +972.3.123.4567 (ext. 100)';
      const url = buildPhoneUrl(phone);

      expect(url).toContain('tel:+972 3 123 4567');
    });
  });
});
