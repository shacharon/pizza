/**
 * Distance Utility Tests
 * Unit tests for Haversine distance calculation and walking time estimation
 */

import { calculateDistance, calculateWalkingTime, formatDistance } from './distance.util';
import type { Coordinates } from '../domain/types/search.types';

describe('Distance Utilities', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates', () => {
      // Tel Aviv Center to Rabin Square (roughly 1.5 km)
      const from: Coordinates = { lat: 32.0853, lng: 34.7818 };
      const to: Coordinates = { lat: 32.0809, lng: 34.7806 };

      const distance = calculateDistance(from, to);

      // Distance should be approximately 500-600 meters
      expect(distance).toBeGreaterThan(400);
      expect(distance).toBeLessThan(700);
    });

    it('should return 0 for identical coordinates', () => {
      const coords: Coordinates = { lat: 32.0853, lng: 34.7818 };
      const distance = calculateDistance(coords, coords);

      expect(distance).toBe(0);
    });

    it('should calculate distance between distant points', () => {
      // Tel Aviv to Jerusalem (roughly 60 km)
      const telAviv: Coordinates = { lat: 32.0853, lng: 34.7818 };
      const jerusalem: Coordinates = { lat: 31.7683, lng: 35.2137 };

      const distance = calculateDistance(telAviv, jerusalem);

      // Distance should be approximately 50-70 km
      expect(distance).toBeGreaterThan(50000);
      expect(distance).toBeLessThan(70000);
    });
  });

  describe('calculateWalkingTime', () => {
    it('should calculate walking time for 500 meters (6 minutes)', () => {
      const time = calculateWalkingTime(500);
      expect(time).toBe(6); // 500 / 83.3 ≈ 6
    });

    it('should calculate walking time for 1000 meters (12 minutes)', () => {
      const time = calculateWalkingTime(1000);
      expect(time).toBe(12); // 1000 / 83.3 ≈ 12
    });

    it('should calculate walking time for 250 meters (3 minutes)', () => {
      const time = calculateWalkingTime(250);
      expect(time).toBe(3); // 250 / 83.3 ≈ 3
    });

    it('should round to nearest minute', () => {
      const time = calculateWalkingTime(83.3); // Exactly 1 minute
      expect(time).toBe(1);
    });

    it('should return 0 for 0 distance', () => {
      const time = calculateWalkingTime(0);
      expect(time).toBe(0);
    });
  });

  describe('formatDistance', () => {
    it('should format distance under 1km in meters (Hebrew)', () => {
      expect(formatDistance(500, 'מ׳', 'ק״מ')).toBe('500 מ׳');
      expect(formatDistance(125, 'מ׳', 'ק״מ')).toBe('125 מ׳');
      expect(formatDistance(999, 'מ׳', 'ק״מ')).toBe('999 מ׳');
    });

    it('should format distance over 1km in kilometers (Hebrew)', () => {
      expect(formatDistance(1000, 'מ׳', 'ק״מ')).toBe('1.0 ק״מ');
      expect(formatDistance(1500, 'מ׳', 'ק״מ')).toBe('1.5 ק״מ');
      expect(formatDistance(2350, 'מ׳', 'ק״מ')).toBe('2.4 ק״מ'); // Rounded to 1 decimal
    });

    it('should format distance under 1km in meters (English)', () => {
      expect(formatDistance(500, 'm', 'km')).toBe('500 m');
      expect(formatDistance(125, 'm', 'km')).toBe('125 m');
      expect(formatDistance(999, 'm', 'km')).toBe('999 m');
    });

    it('should format distance over 1km in kilometers (English)', () => {
      expect(formatDistance(1000, 'm', 'km')).toBe('1.0 km');
      expect(formatDistance(1500, 'm', 'km')).toBe('1.5 km');
    });

    it('should format distance in Arabic', () => {
      expect(formatDistance(500, 'م', 'كم')).toBe('500 م');
      expect(formatDistance(1500, 'م', 'كم')).toBe('1.5 كم');
    });

    it('should format distance in Russian', () => {
      expect(formatDistance(500, 'м', 'км')).toBe('500 м');
      expect(formatDistance(1500, 'м', 'км')).toBe('1.5 км');
    });

    it('should round meters to nearest integer', () => {
      expect(formatDistance(124.6, 'מ׳', 'ק״מ')).toBe('125 מ׳');
      expect(formatDistance(124.4, 'מ׳', 'ק״מ')).toBe('124 מ׳');
    });

    it('should format 0 distance', () => {
      expect(formatDistance(0, 'מ׳', 'ק״מ')).toBe('0 מ׳');
    });
  });
});
