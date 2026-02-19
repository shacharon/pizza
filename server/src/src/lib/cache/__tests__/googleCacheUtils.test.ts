/**
 * Unit tests for Google Cache Utils
 * 
 * Focus: Key normalization and consistency
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { generateTextSearchCacheKey } from '../googleCacheUtils.js';

describe('generateTextSearchCacheKey', () => {
  const baseParams = {
    languageCode: 'he',
    regionCode: 'IL',
    bias: null,
    fieldMask: 'places.id,places.displayName',
    pipelineVersion: 'route2'
  };

  it('normalizes multiple spaces in textQuery', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza    in    tel aviv'
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza in tel aviv'
    });

    assert.strictEqual(key1, key2, 'Multiple spaces should be collapsed to single space');
  });

  it('normalizes leading and trailing spaces', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: '  pizza in tel aviv  '
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza in tel aviv'
    });

    assert.strictEqual(key1, key2, 'Leading/trailing spaces should be trimmed');
  });

  it('normalizes case (lowercase)', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'PIZZA IN TEL AVIV'
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza in tel aviv'
    });

    assert.strictEqual(key1, key2, 'Query should be case-insensitive');
  });

  it('generates different keys for different queries', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza in tel aviv'
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'hummus in tel aviv'
    });

    assert.notStrictEqual(key1, key2, 'Different queries should produce different keys');
  });

  it('generates different keys for different regions', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      regionCode: 'IL'
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      regionCode: 'US'
    });

    assert.notStrictEqual(key1, key2, 'Different regions should produce different keys');
  });

  it('generates different keys for different languages', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      languageCode: 'he'
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      languageCode: 'en'
    });

    assert.notStrictEqual(key1, key2, 'Different languages should produce different keys');
  });

  it('generates different keys for different biases', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      bias: { lat: 32.080, lng: 34.780, radiusMeters: 1000 }
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      bias: { lat: 31.780, lng: 35.230, radiusMeters: 2000 }
    });

    assert.notStrictEqual(key1, key2, 'Different bias coordinates should produce different keys');
  });

  it('generates different keys for bias vs no bias', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      bias: null
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      bias: { lat: 32.080, lng: 34.780, radiusMeters: 1000 }
    });

    assert.notStrictEqual(key1, key2, 'Bias presence should affect cache key');
  });

  it('rounds bias coordinates for bucketing (same bucket)', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      bias: { lat: 32.08044, lng: 34.78076, radiusMeters: 1200 }
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      bias: { lat: 32.08049, lng: 34.78079, radiusMeters: 1300 }
    });

    // Both should round to 32.080, 34.781, and radius bucket to 1500
    assert.strictEqual(key1, key2, 'Nearby coordinates in same bucket should produce same key');
  });

  it('generates different keys for different field masks', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      fieldMask: 'places.id,places.displayName'
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      fieldMask: 'places.id,places.displayName,places.photos'
    });

    assert.notStrictEqual(key1, key2, 'Different field masks should produce different keys');
  });

  it('generates different keys for different pipeline versions', () => {
    const key1 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      pipelineVersion: 'route2'
    });

    const key2 = generateTextSearchCacheKey({
      ...baseParams,
      textQuery: 'pizza',
      pipelineVersion: 'v1'
    });

    assert.notStrictEqual(key1, key2, 'Different pipeline versions should produce different keys');
  });

  it('generates consistent keys (idempotent)', () => {
    const params = {
      textQuery: '  מסעדות  איטלקיות  בגדרה  ',
      languageCode: 'he',
      regionCode: 'IL',
      bias: { lat: 31.81001, lng: 34.77502, radiusMeters: 2500 },
      fieldMask: PLACES_FIELD_MASK,
      pipelineVersion: 'route2'
    };

    const key1 = generateTextSearchCacheKey(params);
    const key2 = generateTextSearchCacheKey(params);
    const key3 = generateTextSearchCacheKey(params);

    assert.strictEqual(key1, key2, 'Key generation should be deterministic');
    assert.strictEqual(key2, key3, 'Key generation should be deterministic');
  });
});

// Field mask constant for tests
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes,places.photos,places.types,places.googleMapsUri';
