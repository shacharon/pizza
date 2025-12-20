/**
 * Unit tests for GeocodeCache
 * Tests caching, expiry, hit/miss tracking
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GeocodeCache } from '../../src/services/places/cache/geocode-cache.js';

describe('GeocodeCache', () => {
    let cache: GeocodeCache;

    beforeEach(() => {
        cache = new GeocodeCache();
    });

    it('should store and retrieve coordinates', () => {
        const coords = { lat: 31.668, lng: 34.574 };
        cache.set('ashkelon', 'he', coords);

        const retrieved = cache.get('ashkelon', 'he');
        
        assert.deepStrictEqual(retrieved, coords);
    });

    test('should return null for non-existent location', () => {
        const retrieved = cache.get('non-existent', 'en');
        assert.strictEqual(retrieved, null);
    });

    test('should be case-insensitive', () => {
        const coords = { lat: 31.668, lng: 34.574 };
        cache.set('Ashkelon', 'he', coords);

        const retrieved = cache.get('ashkelon', 'he');
        
        assert.deepStrictEqual(retrieved, coords, 'Should match case-insensitively');
    });

    test('should handle different languages separately', () => {
        const heCoords = { lat: 31.668, lng: 34.574 };
        const enCoords = { lat: 31.669, lng: 34.575 };
        
        cache.set('אשקלון', 'he', heCoords);
        cache.set('ashkelon', 'en', enCoords);

        const heRetrieved = cache.get('אשקלון', 'he');
        const enRetrieved = cache.get('ashkelon', 'en');
        
        assert.deepStrictEqual(heRetrieved, heCoords);
        assert.deepStrictEqual(enRetrieved, enCoords);
    });

    test('should track cache hits and misses', () => {
        cache.set('ashkelon', 'he', { lat: 31.668, lng: 34.574 });

        cache.get('ashkelon', 'he'); // hit
        cache.get('tel aviv', 'he'); // miss
        cache.get('ashkelon', 'he'); // hit

        const stats = cache.getStats();
        
        assert.strictEqual(stats.hits, 2);
        assert.strictEqual(stats.misses, 1);
        assert.strictEqual(stats.hitRate, 0.67); // 2/3
    });

    test('should check if location is cached', () => {
        cache.set('ashkelon', 'he', { lat: 31.668, lng: 34.574 });

        assert.strictEqual(cache.has('ashkelon', 'he'), true);
        assert.strictEqual(cache.has('tel aviv', 'he'), false);
    });

    test('should clear specific location', () => {
        cache.set('ashkelon', 'he', { lat: 31.668, lng: 34.574 });
        cache.clear('ashkelon', 'he');

        const retrieved = cache.get('ashkelon', 'he');
        assert.strictEqual(retrieved, null);
    });

    test('should clear all entries', () => {
        cache.set('ashkelon', 'he', { lat: 31.668, lng: 34.574 });
        cache.set('tel aviv', 'he', { lat: 32.08, lng: 34.78 });
        
        cache.clearAll();

        assert.strictEqual(cache.size(), 0);
        const stats = cache.getStats();
        assert.strictEqual(stats.hits, 0);
        assert.strictEqual(stats.misses, 0);
    });

    test('should return correct cache size', () => {
        cache.set('ashkelon', 'he', { lat: 31.668, lng: 34.574 });
        cache.set('tel aviv', 'he', { lat: 32.08, lng: 34.78 });

        assert.strictEqual(cache.size(), 2);
    });

    test('should get cache statistics', () => {
        cache.set('ashkelon', 'he', { lat: 31.668, lng: 34.574 });
        cache.get('ashkelon', 'he'); // hit
        cache.get('tel aviv', 'he'); // miss

        const stats = cache.getStats();
        
        assert.strictEqual(stats.size, 1);
        assert.strictEqual(stats.hits, 1);
        assert.strictEqual(stats.misses, 1);
        assert.strictEqual(stats.hitRate, 0.5);
    });
});

