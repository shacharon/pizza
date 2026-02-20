/**
 * Wolt Deep-Link Utility Tests
 */

import { appendWoltTrackingParams, appendTenbisTrackingParams, appendMishlohaTrackingParams, buildWoltSearchUrl, buildWoltUrl, buildTenbisUrl, buildMishlohaUrl, isValid10bisUrl, isValidMishlohaUrl, extractCitySlug, extractCityText } from './wolt-deeplink.util';

describe('Wolt Deep-Link Utility', () => {
  describe('extractCitySlug', () => {
    it('should extract tel-aviv from English address', () => {
      expect(extractCitySlug('123 Main St, Tel Aviv, Israel')).toBe('tel-aviv');
    });

    it('should extract tel-aviv from Hebrew address', () => {
      expect(extractCitySlug('רחוב הראשי 123, תל אביב, ישראל')).toBe('tel-aviv');
    });

    it('should extract jerusalem from address', () => {
      expect(extractCitySlug('King David St, Jerusalem, Israel')).toBe('jerusalem');
    });

    it('should extract haifa from address', () => {
      expect(extractCitySlug('Herzl St, Haifa, Israel')).toBe('haifa');
    });

    it('should handle partial city matches', () => {
      expect(extractCitySlug('Some St, Tel Aviv-Yafo, Israel')).toBe('tel-aviv');
    });

    it('should fallback to tel-aviv for unknown city', () => {
      expect(extractCitySlug('Unknown Street, Unknown City, Israel')).toBe('tel-aviv');
    });

    it('should fallback to tel-aviv for undefined address', () => {
      expect(extractCitySlug(undefined)).toBe('tel-aviv');
    });

    it('should fallback to tel-aviv for empty address', () => {
      expect(extractCitySlug('')).toBe('tel-aviv');
    });
  });

  describe('extractCityText', () => {
    it('should extract city text from standard address', () => {
      expect(extractCityText('123 Main St, Tel Aviv, Israel')).toBe('Tel Aviv');
    });

    it('should extract city text from Hebrew address', () => {
      expect(extractCityText('רחוב הראשי 123, תל אביב, ישראל')).toBe('תל אביב');
    });

    it('should return null for address with only one part', () => {
      expect(extractCityText('Just a street')).toBeNull();
    });

    it('should return null for undefined address', () => {
      expect(extractCityText(undefined)).toBeNull();
    });

    it('should return null for empty address', () => {
      expect(extractCityText('')).toBeNull();
    });
  });

  describe('buildWoltUrl', () => {
    it('should append tracking params to URL without params', () => {
      const url = buildWoltUrl('https://wolt.com/he/isr/tel-aviv/venue/restaurant-name');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('utm_medium=referral');
      expect(url).toContain('utm_campaign=provider_link');
      expect(url).toContain('ref=going2eat');
      expect(url).toContain('/venue/restaurant-name');
    });

    it('should preserve existing query string when URL has params', () => {
      const url = buildWoltUrl('https://wolt.com/en/isr/tel-aviv/search?query=pizza&sort=rating');
      expect(url).toContain('query=pizza');
      expect(url).toContain('sort=rating');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('utm_medium=referral');
    });

    it('should not duplicate utm_source when URL already contains it', () => {
      const base = 'https://wolt.com/he/venue?utm_source=other';
      const url = buildWoltUrl(base);
      const matches = url.match(/utm_source=/g);
      expect(matches).toHaveLength(1);
      expect(url).toContain('utm_source=other');
    });

    it('should not modify non-Wolt domains', () => {
      const other = 'https://www.10bis.co.il/next/restaurants?q=foo';
      expect(buildWoltUrl(other)).toBe(other);
    });
  });

  describe('appendWoltTrackingParams', () => {
    it('should append utm_source, utm_medium, utm_campaign, ref to wolt.com URLs', () => {
      const url = appendWoltTrackingParams('https://wolt.com/he/isr/tel-aviv/search?query=pizza');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('utm_medium=referral');
      expect(url).toContain('utm_campaign=provider_link');
      expect(url).toContain('ref=going2eat');
      expect(url).toContain('query=pizza');
    });

    it('should use & when query already exists', () => {
      const url = appendWoltTrackingParams('https://wolt.com/en/isr/tel-aviv/venue/foo?q=bar');
      expect(url).toContain('?q=bar&');
      expect(url).toContain('utm_source=going2eat');
    });

    it('should not duplicate params if already present', () => {
      const withParam = 'https://wolt.com/he/venue?utm_source=other';
      const url = appendWoltTrackingParams(withParam);
      const matches = url.match(/utm_source=/g);
      expect(matches).toHaveLength(1);
      expect(url).toContain('utm_source=other');
    });

    it('should leave non-Wolt URLs unchanged', () => {
      const other = 'https://www.10bis.co.il/next/restaurants?q=pizza';
      expect(appendWoltTrackingParams(other)).toBe(other);
    });

    it('should return empty string unchanged', () => {
      expect(appendWoltTrackingParams('')).toBe('');
    });

    it('should return invalid URL unchanged (no throw)', () => {
      expect(appendWoltTrackingParams('not-a-url')).toBe('not-a-url');
    });
  });

  describe('appendTenbisTrackingParams', () => {
    it('should append utm_source, utm_medium, utm_campaign, ref to 10bis.co.il URLs', () => {
      const url = appendTenbisTrackingParams('https://www.10bis.co.il/next/restaurants/search/SearchRestaurantsBy?query=pizza');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('utm_medium=referral');
      expect(url).toContain('utm_campaign=provider_link');
      expect(url).toContain('ref=going2eat');
      expect(url).toContain('query=pizza');
    });

    it('should use & when query already exists', () => {
      const url = appendTenbisTrackingParams('https://www.10bis.co.il/next/restaurants/menu/delivery/12345/test?area=tel-aviv');
      expect(url).toContain('?area=tel-aviv&');
      expect(url).toContain('utm_source=going2eat');
    });

    it('should not duplicate params if already present', () => {
      const withParam = 'https://www.10bis.co.il/next/restaurants?utm_source=other';
      const url = appendTenbisTrackingParams(withParam);
      const matches = url.match(/utm_source=/g);
      expect(matches).toHaveLength(1);
      expect(url).toContain('utm_source=other');
    });

    it('should leave non-10bis URLs unchanged', () => {
      const other = 'https://wolt.com/he/isr/tel-aviv/search?q=pizza';
      expect(appendTenbisTrackingParams(other)).toBe(other);
    });

    it('should return empty string unchanged', () => {
      expect(appendTenbisTrackingParams('')).toBe('');
    });

    it('should return invalid URL unchanged (no throw)', () => {
      expect(appendTenbisTrackingParams('not-a-url')).toBe('not-a-url');
    });
  });

  describe('buildTenbisUrl', () => {
    it('should append tracking params to 10bis URL without params', () => {
      const url = buildTenbisUrl('https://www.10bis.co.il/next/restaurants/menu/delivery/12345/test-restaurant');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('utm_medium=referral');
      expect(url).toContain('utm_campaign=provider_link');
      expect(url).toContain('ref=going2eat');
    });

    it('should preserve existing params and append tracking params', () => {
      const url = buildTenbisUrl('https://www.10bis.co.il/next/restaurants/search/SearchRestaurantsBy?query=pizza&area=tel-aviv');
      expect(url).toContain('query=pizza');
      expect(url).toContain('area=tel-aviv');
      expect(url).toContain('utm_source=going2eat');
    });

    it('should not duplicate utm_source if already present', () => {
      const base = 'https://www.10bis.co.il/next/restaurants?utm_source=existing';
      const url = buildTenbisUrl(base);
      const matches = url.match(/utm_source=/g);
      expect(matches).toHaveLength(1);
      expect(url).toContain('utm_source=existing');
    });

    it('should not modify non-10bis domains', () => {
      const other = 'https://wolt.com/he/isr/tel-aviv/venue/test';
      expect(buildTenbisUrl(other)).toBe(other);
    });
  });

  describe('isValid10bisUrl', () => {
    describe('valid URLs', () => {
      it('should accept URL with /restaurant path', () => {
        expect(isValid10bisUrl('https://www.10bis.co.il/restaurant/12345/test-place')).toBe(true);
      });

      it('should accept URL with /next/r path', () => {
        expect(isValid10bisUrl('https://www.10bis.co.il/next/restaurants/menu/delivery/12345/test')).toBe(true);
      });

      it('should accept URL with /next/restaurants (starts with /next/r)', () => {
        expect(isValid10bisUrl('https://www.10bis.co.il/next/restaurants/search/SearchRestaurantsBy?query=pizza')).toBe(true);
      });

      it('should accept URL with query params', () => {
        expect(isValid10bisUrl('https://www.10bis.co.il/restaurant/12345?area=tel-aviv')).toBe(true);
      });

      it('should accept URL with subdomain', () => {
        expect(isValid10bisUrl('https://www.10bis.co.il/next/restaurants/menu/delivery/12345')).toBe(true);
      });
    });

    describe('invalid URLs', () => {
      it('should reject non-10bis domain', () => {
        expect(isValid10bisUrl('https://wolt.com/he/isr/tel-aviv/venue/test')).toBe(false);
      });

      it('should reject 10bis URL with invalid path', () => {
        expect(isValid10bisUrl('https://www.10bis.co.il/about')).toBe(false);
      });

      it('should reject 10bis URL with /search path (not /restaurant or /next/r)', () => {
        expect(isValid10bisUrl('https://www.10bis.co.il/search?q=pizza')).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValid10bisUrl('')).toBe(false);
      });

      it('should reject invalid URL format', () => {
        expect(isValid10bisUrl('not-a-url')).toBe(false);
      });

      it('should reject URL with 10bis in path but wrong domain', () => {
        expect(isValid10bisUrl('https://example.com/10bis.co.il/restaurant/123')).toBe(false);
      });
    });
  });

  describe('isValidMishlohaUrl', () => {
    describe('valid URLs', () => {
      it('should accept URL with mishloha.co.il domain', () => {
        expect(isValidMishlohaUrl('https://www.mishloha.co.il/now/r/12345/test-place')).toBe(true);
      });

      it('should accept URL with /search path', () => {
        expect(isValidMishlohaUrl('https://www.mishloha.co.il/search?q=pizza')).toBe(true);
      });

      it('should accept URL with query params', () => {
        expect(isValidMishlohaUrl('https://www.mishloha.co.il/now/r/12345?location=tel-aviv')).toBe(true);
      });

      it('should accept URL with subdomain', () => {
        expect(isValidMishlohaUrl('https://www.mishloha.co.il/restaurant/12345')).toBe(true);
      });

      it('should accept any path on mishloha.co.il', () => {
        expect(isValidMishlohaUrl('https://www.mishloha.co.il/about')).toBe(true);
      });
    });

    describe('invalid URLs', () => {
      it('should reject non-Mishloha domain', () => {
        expect(isValidMishlohaUrl('https://wolt.com/he/isr/tel-aviv/venue/test')).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValidMishlohaUrl('')).toBe(false);
      });

      it('should reject invalid URL format', () => {
        expect(isValidMishlohaUrl('not-a-url')).toBe(false);
      });

      it('should reject URL with mishloha in path but wrong domain', () => {
        expect(isValidMishlohaUrl('https://example.com/mishloha.co.il/now/r/123')).toBe(false);
      });

      it('should reject null/undefined', () => {
        expect(isValidMishlohaUrl(null as any)).toBe(false);
        expect(isValidMishlohaUrl(undefined as any)).toBe(false);
      });
    });
  });

  describe('appendMishlohaTrackingParams', () => {
    it('should append utm_source, utm_medium, utm_campaign, ref to mishloha.co.il URLs', () => {
      const url = appendMishlohaTrackingParams('https://www.mishloha.co.il/search?q=pizza');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('utm_medium=referral');
      expect(url).toContain('utm_campaign=provider_link');
      expect(url).toContain('ref=going2eat');
      expect(url).toContain('q=pizza');
    });

    it('should use & when query already exists', () => {
      const url = appendMishlohaTrackingParams('https://www.mishloha.co.il/now/r/12345?location=tel-aviv');
      expect(url).toContain('?location=tel-aviv&');
      expect(url).toContain('utm_source=going2eat');
    });

    it('should not duplicate params if already present', () => {
      const withParam = 'https://www.mishloha.co.il/search?utm_source=other';
      const url = appendMishlohaTrackingParams(withParam);
      const matches = url.match(/utm_source=/g);
      expect(matches).toHaveLength(1);
      expect(url).toContain('utm_source=other');
    });

    it('should leave non-Mishloha URLs unchanged', () => {
      const other = 'https://wolt.com/he/isr/tel-aviv/search?q=pizza';
      expect(appendMishlohaTrackingParams(other)).toBe(other);
    });

    it('should return empty string unchanged', () => {
      expect(appendMishlohaTrackingParams('')).toBe('');
    });

    it('should return invalid URL unchanged (no throw)', () => {
      expect(appendMishlohaTrackingParams('not-a-url')).toBe('not-a-url');
    });
  });

  describe('buildMishlohaUrl', () => {
    it('should append tracking params to Mishloha URL without params', () => {
      const url = buildMishlohaUrl('https://www.mishloha.co.il/now/r/12345/test-restaurant');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('utm_medium=referral');
      expect(url).toContain('utm_campaign=provider_link');
      expect(url).toContain('ref=going2eat');
    });

    it('should preserve existing params and append tracking params', () => {
      const url = buildMishlohaUrl('https://www.mishloha.co.il/search?q=pizza&location=tel-aviv');
      expect(url).toContain('q=pizza');
      expect(url).toContain('location=tel-aviv');
      expect(url).toContain('utm_source=going2eat');
    });

    it('should not duplicate utm_source if already present', () => {
      const base = 'https://www.mishloha.co.il/search?utm_source=existing';
      const url = buildMishlohaUrl(base);
      const matches = url.match(/utm_source=/g);
      expect(matches).toHaveLength(1);
      expect(url).toContain('utm_source=existing');
    });

    it('should not modify non-Mishloha domains', () => {
      const other = 'https://www.10bis.co.il/next/restaurants/menu/12345';
      expect(buildMishlohaUrl(other)).toBe(other);
    });

    it('should handle empty string without throwing', () => {
      expect(buildMishlohaUrl('')).toBe('');
    });

    it('should handle invalid URL without throwing', () => {
      expect(buildMishlohaUrl('not-a-url')).toBe('not-a-url');
    });

    it('should handle null/undefined gracefully', () => {
      expect(buildMishlohaUrl(null as any)).toBe(null);
      expect(buildMishlohaUrl(undefined as any)).toBe(undefined);
    });

    it('should preserve URL hash fragment', () => {
      const url = buildMishlohaUrl('https://www.mishloha.co.il/now/r/12345#menu');
      expect(url).toContain('#menu');
      expect(url).toContain('utm_source=going2eat');
    });

    it('should handle multiple existing query params correctly', () => {
      const url = buildMishlohaUrl('https://www.mishloha.co.il/search?q=pizza&sort=rating&filter=kosher');
      expect(url).toContain('q=pizza');
      expect(url).toContain('sort=rating');
      expect(url).toContain('filter=kosher');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('utm_medium=referral');
    });
  });

  describe('buildWoltSearchUrl', () => {
    it('should build URL with all parameters and tracking params', () => {
      const url = buildWoltSearchUrl('Pizza Place', 'tel-aviv', 'Tel Aviv', 'he');
      expect(url).toContain('https://wolt.com/he/isr/tel-aviv/search?query=Pizza%20Place%20Tel%20Aviv');
      expect(url).toContain('utm_source=going2eat');
      expect(url).toContain('ref=going2eat');
    });

    it('should build URL without cityText', () => {
      const url = buildWoltSearchUrl('Burger Joint', 'haifa', undefined, 'en');
      expect(url).toContain('https://wolt.com/en/isr/haifa/search?query=Burger%20Joint');
      expect(url).toContain('utm_source=going2eat');
    });

    it('should use default language (he)', () => {
      const url = buildWoltSearchUrl('Shawarma King', 'jerusalem');
      expect(url).toContain('https://wolt.com/he/isr/jerusalem/search?query=Shawarma%20King');
    });

    it('should fallback to tel-aviv when citySlug is undefined', () => {
      const url = buildWoltSearchUrl('Falafel House', undefined, undefined, 'en');
      expect(url).toContain('https://wolt.com/en/isr/tel-aviv/search?query=Falafel%20House');
    });

    it('should encode special characters in restaurant name', () => {
      const url = buildWoltSearchUrl('Pizza & Pasta', 'tel-aviv', undefined, 'he');
      expect(url).toContain('query=Pizza%20%26%20Pasta');
    });

    it('should encode special characters in city text', () => {
      const url = buildWoltSearchUrl('Restaurant', 'tel-aviv', 'Tel Aviv-Yafo', 'he');
      expect(url).toContain('query=Restaurant%20Tel%20Aviv-Yafo');
    });

    it('should return null when restaurantName is undefined', () => {
      const url = buildWoltSearchUrl(undefined, 'tel-aviv', 'Tel Aviv', 'he');
      expect(url).toBeNull();
    });

    it('should return null when restaurantName is empty', () => {
      const url = buildWoltSearchUrl('', 'tel-aviv', 'Tel Aviv', 'he');
      expect(url).toBeNull();
    });

    it('should return null when restaurantName is only whitespace', () => {
      const url = buildWoltSearchUrl('   ', 'tel-aviv', 'Tel Aviv', 'he');
      expect(url).toBeNull();
    });

    it('should handle Hebrew restaurant names', () => {
      const url = buildWoltSearchUrl('מסעדת הפיצה', 'tel-aviv', 'תל אביב', 'he');
      expect(url).toContain('https://wolt.com/he/isr/tel-aviv/search?query=');
      expect(url).toContain('utm_source=going2eat');
    });
  });
});
