/**
 * Wolt Deep-Link Utility Tests
 */

import { buildWoltSearchUrl, extractCitySlug, extractCityText } from './wolt-deeplink.util';

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

  describe('buildWoltSearchUrl', () => {
    it('should build URL with all parameters', () => {
      const url = buildWoltSearchUrl('Pizza Place', 'tel-aviv', 'Tel Aviv', 'he');
      expect(url).toBe('https://wolt.com/he/isr/tel-aviv/search?query=Pizza%20Place%20Tel%20Aviv');
    });

    it('should build URL without cityText', () => {
      const url = buildWoltSearchUrl('Burger Joint', 'haifa', undefined, 'en');
      expect(url).toBe('https://wolt.com/en/isr/haifa/search?query=Burger%20Joint');
    });

    it('should use default language (he)', () => {
      const url = buildWoltSearchUrl('Shawarma King', 'jerusalem');
      expect(url).toBe('https://wolt.com/he/isr/jerusalem/search?query=Shawarma%20King');
    });

    it('should fallback to tel-aviv when citySlug is undefined', () => {
      const url = buildWoltSearchUrl('Falafel House', undefined, undefined, 'en');
      expect(url).toBe('https://wolt.com/en/isr/tel-aviv/search?query=Falafel%20House');
    });

    it('should encode special characters in restaurant name', () => {
      const url = buildWoltSearchUrl('Pizza & Pasta', 'tel-aviv', undefined, 'he');
      expect(url).toBe('https://wolt.com/he/isr/tel-aviv/search?query=Pizza%20%26%20Pasta');
    });

    it('should encode special characters in city text', () => {
      const url = buildWoltSearchUrl('Restaurant', 'tel-aviv', 'Tel Aviv-Yafo', 'he');
      expect(url).toBe('https://wolt.com/he/isr/tel-aviv/search?query=Restaurant%20Tel%20Aviv-Yafo');
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
      expect(url).toBe('https://wolt.com/he/isr/tel-aviv/search?query=%D7%9E%D7%A1%D7%A2%D7%93%D7%AA%20%D7%94%D7%A4%D7%99%D7%A6%D7%94%20%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91');
    });
  });
});
