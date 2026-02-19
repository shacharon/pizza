/**
 * Unit tests for field-mask-builder
 * Tests expected field list and defaults
 */

import { describe, it, expect } from 'vitest';
import { getTextSearchFieldMask } from '../field-mask-builder.js';

describe('getTextSearchFieldMask', () => {
  it('should return expected field mask string', () => {
    const mask = getTextSearchFieldMask();
    
    // Verify it's a non-empty string
    expect(mask).toBeTruthy();
    expect(typeof mask).toBe('string');
  });

  it('should include all required fields', () => {
    const mask = getTextSearchFieldMask();
    
    // Required fields for restaurant search
    const requiredFields = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.rating',
      'places.userRatingCount',
      'places.priceLevel',
      'places.currentOpeningHours',
      'places.regularOpeningHours',
      'places.utcOffsetMinutes',
      'places.photos',
      'places.types',
      'places.googleMapsUri'
    ];

    for (const field of requiredFields) {
      expect(mask).toContain(field);
    }
  });

  it('should be a valid field mask format (comma-separated)', () => {
    const mask = getTextSearchFieldMask();
    
    // Should contain commas (multiple fields)
    expect(mask).toContain(',');
    
    // Should start with "places."
    expect(mask).toMatch(/^places\./);
    
    // Should not have spaces (compact format)
    expect(mask).not.toContain(' ');
  });

  it('should return the same value on multiple calls (deterministic)', () => {
    const mask1 = getTextSearchFieldMask();
    const mask2 = getTextSearchFieldMask();
    
    expect(mask1).toBe(mask2);
  });

  it('should include opening hours fields for restaurant availability', () => {
    const mask = getTextSearchFieldMask();
    
    expect(mask).toContain('currentOpeningHours');
    expect(mask).toContain('regularOpeningHours');
  });

  it('should include rating fields for quality filtering', () => {
    const mask = getTextSearchFieldMask();
    
    expect(mask).toContain('rating');
    expect(mask).toContain('userRatingCount');
  });

  it('should include location fields for distance calculation', () => {
    const mask = getTextSearchFieldMask();
    
    expect(mask).toContain('location');
  });
});
