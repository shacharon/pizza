/**
 * Tests for City Alias Service
 * Verifies multilingual city name matching
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CityAliasService } from '../src/services/search/filters/city-alias.service.js';

describe('CityAliasService', () => {
  const service = new CityAliasService();

  describe('areAliases()', () => {
    it('should match Tel Aviv in Hebrew and English', () => {
      assert.strictEqual(service.areAliases('Tel Aviv', 'תל אביב'), true);
    });

    it('should match Tel Aviv in Arabic and English', () => {
      assert.strictEqual(service.areAliases('Tel Aviv', 'تل أبيب'), true);
    });

    it('should match Jerusalem variants', () => {
      assert.strictEqual(service.areAliases('Jerusalem', 'ירושלים'), true);
      assert.strictEqual(service.areAliases('Jerusalem', 'القدس'), true);
      assert.strictEqual(service.areAliases('Yerushalayim', 'Al-Quds'), true);
    });

    it('should match Haifa variants', () => {
      assert.strictEqual(service.areAliases('Haifa', 'חיפה'), true);
      assert.strictEqual(service.areAliases('Haifa', 'حيفا'), true);
    });

    it('should match Gedera variants', () => {
      assert.strictEqual(service.areAliases('Gedera', 'גדרה'), true);
      assert.strictEqual(service.areAliases('Gedera', 'جديرة'), true);
      assert.strictEqual(service.areAliases('Gdera', 'גדרה'), true);
    });

    it('should match Yavne variants', () => {
      assert.strictEqual(service.areAliases('Yavne', 'יבנה'), true);
      assert.strictEqual(service.areAliases('Yavneh', 'Yibna'), true);
    });

    it('should be case-insensitive', () => {
      assert.strictEqual(service.areAliases('TEL AVIV', 'tel aviv'), true);
      assert.strictEqual(service.areAliases('Jerusalem', 'JERUSALEM'), true);
    });

    it('should handle whitespace', () => {
      assert.strictEqual(service.areAliases('  Tel Aviv  ', 'Tel Aviv'), true);
    });

    it('should return false for different cities', () => {
      assert.strictEqual(service.areAliases('Tel Aviv', 'Haifa'), false);
      assert.strictEqual(service.areAliases('Jerusalem', 'Beer Sheva'), false);
    });

    it('should return true for exact matches', () => {
      assert.strictEqual(service.areAliases('Haifa', 'Haifa'), true);
      assert.strictEqual(service.areAliases('חיפה', 'חיפה'), true);
    });

    it('should match Yafo/Jaffa variants', () => {
      assert.strictEqual(service.areAliases('Yafo', 'Jaffa'), true);
      assert.strictEqual(service.areAliases('Yafo', 'יפו'), true);
      assert.strictEqual(service.areAliases('Jaffa', 'Yafa'), true);
    });
  });

  describe('getAliases()', () => {
    it('should return all aliases for Tel Aviv', () => {
      const aliases = service.getAliases('Tel Aviv');
      assert.ok(aliases.has('tel aviv'));
      assert.ok(aliases.has('תל אביב'));
      assert.ok(aliases.has('تل أبيب'));
      assert.ok(aliases.size >= 4);
    });

    it('should return aliases for Hebrew city name', () => {
      const aliases = service.getAliases('ירושלים');
      assert.ok(aliases.has('jerusalem'));
      assert.ok(aliases.has('ירושלים'));
      assert.ok(aliases.has('القدس'));
    });

    it('should return single-element set for unknown city', () => {
      const aliases = service.getAliases('Unknown City');
      assert.strictEqual(aliases.size, 1);
      assert.ok(aliases.has('unknown city'));
    });
  });

  describe('addressContainsCity()', () => {
    it('should match Tel Aviv in English address', () => {
      const address = '123 Dizengoff St, Tel Aviv-Yafo, Israel';
      assert.strictEqual(service.addressContainsCity(address, 'תל אביב'), true);
    });

    it('should match Tel Aviv in Hebrew address', () => {
      const address = 'רחוב דיזנגוף 123, תל אביב';
      assert.strictEqual(service.addressContainsCity(address, 'Tel Aviv'), true);
    });

    it('should match Tel Aviv in mixed address', () => {
      const address = 'Dizengoff St 123, תל אביב, Israel';
      assert.strictEqual(service.addressContainsCity(address, 'Tel Aviv'), true);
    });

    it('should match Gedera in Hebrew address', () => {
      const address = 'רחוב הרצל 45, גדרה';
      assert.strictEqual(service.addressContainsCity(address, 'Gedera'), true);
    });

    it('should match Gedera in English address', () => {
      const address = 'Herzl St 45, Gedera, Israel';
      assert.strictEqual(service.addressContainsCity(address, 'גדרה'), true);
    });

    it('should match Yavne variants', () => {
      const address = 'Main St, Yavne, Israel';
      assert.strictEqual(service.addressContainsCity(address, 'יבנה'), true);
    });

    it('should be case-insensitive for address', () => {
      const address = 'DIZENGOFF ST 123, TEL AVIV';
      assert.strictEqual(service.addressContainsCity(address, 'תל אביב'), true);
    });

    it('should return false for different city', () => {
      const address = '123 Ben Yehuda St, Haifa, Israel';
      assert.strictEqual(service.addressContainsCity(address, 'Tel Aviv'), false);
    });

    it('should match Jerusalem variants', () => {
      const address1 = 'King George St, Jerusalem';
      const address2 = 'רחוב המלך ג\'ורג\', ירושלים';
      assert.strictEqual(service.addressContainsCity(address1, 'ירושלים'), true);
      assert.strictEqual(service.addressContainsCity(address2, 'Jerusalem'), true);
    });
  });

  describe('getStats()', () => {
    it('should return stats about alias database', () => {
      const stats = service.getStats();
      assert.ok(stats.cities > 0);
      assert.ok(stats.totalAliases > stats.cities);
    });
  });
});

