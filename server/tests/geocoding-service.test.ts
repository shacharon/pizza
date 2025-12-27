/**
 * GeocodingService Tests
 * Tests city validation, caching, and API integration
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { GeocodingService } from '../src/services/search/geocoding/geocoding.service.js';

describe('GeocodingService', () => {
  let service: GeocodingService;
  const MOCK_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || 'test-key';

  before(() => {
    service = new GeocodingService(MOCK_API_KEY);
  });

  after(() => {
    service.clearCache();
  });

  describe('validateCity', () => {
    it('should return VERIFIED for known city', async () => {
      const result = await service.validateCity('Tel Aviv');
      
      assert.strictEqual(result.status, 'VERIFIED');
      assert.ok(result.coordinates);
      assert.ok(result.displayName);
      assert.strictEqual(result.confidence, 1.0);
    });

    it('should return FAILED for invalid city', async () => {
      const result = await service.validateCity('InvalidCityXYZ123');
      
      assert.strictEqual(result.status, 'FAILED');
      assert.strictEqual(result.confidence, 0);
      assert.strictEqual(result.coordinates, undefined);
    });

    it('should work with Hebrew city names', async () => {
      const result = await service.validateCity('תל אביב');
      
      assert.strictEqual(result.status, 'VERIFIED');
      assert.ok(result.coordinates);
    });

    it('should cache results', async () => {
      // First call
      const result1 = await service.validateCity('Jerusalem');
      assert.strictEqual(result1.cacheHit, undefined);
      
      // Second call (should hit cache)
      const result2 = await service.validateCity('Jerusalem');
      assert.strictEqual(result2.cacheHit, true);
      assert.strictEqual(result2.status, result1.status);
    });

    it('should use country hint when provided', async () => {
      const result = await service.validateCity('Paris', 'FR');
      
      assert.strictEqual(result.status, 'VERIFIED');
      assert.ok(result.displayName?.includes('France'));
    });
  });

  describe('geocode', () => {
    it('should geocode a full address', async () => {
      const result = await service.geocode('1600 Amphitheatre Parkway, Mountain View, CA');
      
      assert.strictEqual(result.status, 'VERIFIED');
      assert.ok(result.coordinates);
      assert.ok(result.displayName);
    });

    it('should return FAILED for invalid address', async () => {
      const result = await service.geocode('Invalid Address XYZ 99999');
      
      assert.strictEqual(result.status, 'FAILED');
    });
  });

  describe('cache management', () => {
    it('should provide cache stats', () => {
      const stats = service.getCacheStats();
      
      assert.ok(stats.size >= 0);
      assert.ok(stats.entries >= 0);
    });

    it('should clear cache', () => {
      service.validateCity('Test City').catch(() => {});
      service.clearCache();
      
      const stats = service.getCacheStats();
      assert.strictEqual(stats.size, 0);
    });
  });
});








