/**
 * Tests for DistanceCalculator
 * Verifies correct distance calculations using Haversine formula
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DistanceCalculator } from '../ranking.distance-calculator.js';

describe('DistanceCalculator', () => {
  const calculator = new DistanceCalculator();

  describe('toRadians', () => {
    it('should convert 0 degrees to 0 radians', () => {
      assert.equal(calculator.toRadians(0), 0);
    });

    it('should convert 180 degrees to π radians', () => {
      const result = calculator.toRadians(180);
      assert.ok(Math.abs(result - Math.PI) < 0.0001);
    });

    it('should convert 90 degrees to π/2 radians', () => {
      const result = calculator.toRadians(90);
      assert.ok(Math.abs(result - Math.PI / 2) < 0.0001);
    });

    it('should convert 360 degrees to 2π radians', () => {
      const result = calculator.toRadians(360);
      assert.ok(Math.abs(result - 2 * Math.PI) < 0.0001);
    });

    it('should handle negative degrees', () => {
      const result = calculator.toRadians(-90);
      assert.ok(Math.abs(result + Math.PI / 2) < 0.0001);
    });

    it('should handle decimal degrees', () => {
      const result = calculator.toRadians(45.5);
      const expected = 45.5 * (Math.PI / 180);
      assert.ok(Math.abs(result - expected) < 0.0001);
    });
  });

  describe('haversine', () => {
    describe('same point distance', () => {
      it('should return 0 for identical coordinates', () => {
        const distance = calculator.haversine(32.0853, 34.7818, 32.0853, 34.7818);
        assert.equal(distance, 0);
      });

      it('should return 0 for origin (0,0) to itself', () => {
        const distance = calculator.haversine(0, 0, 0, 0);
        assert.equal(distance, 0);
      });
    });

    describe('known distances (Israel)', () => {
      it('should calculate Tel Aviv to Jerusalem distance (~54 km)', () => {
        // Tel Aviv: 32.0853°N, 34.7818°E
        // Jerusalem: 31.7683°N, 35.2137°E
        // Actual great-circle distance: ~53.9 km
        const distance = calculator.haversine(32.0853, 34.7818, 31.7683, 35.2137);
        
        // Allow 1km tolerance for spherical approximation
        assert.ok(distance > 53 && distance < 55, `Expected ~54km, got ${distance}km`);
      });

      it('should calculate Tel Aviv to Haifa distance (~81 km)', () => {
        // Tel Aviv: 32.0853°N, 34.7818°E
        // Haifa: 32.7940°N, 34.9896°E
        // Actual great-circle distance: ~81.2 km
        const distance = calculator.haversine(32.0853, 34.7818, 32.7940, 34.9896);
        
        // Allow 2km tolerance
        assert.ok(distance > 80 && distance < 83, `Expected ~81km, got ${distance}km`);
      });

      it('should calculate Tel Aviv to Eilat distance (~281 km)', () => {
        // Tel Aviv: 32.0853°N, 34.7818°E
        // Eilat: 29.5581°N, 34.9482°E
        // Actual great-circle distance: ~281.5 km
        const distance = calculator.haversine(32.0853, 34.7818, 29.5581, 34.9482);
        
        // Allow 5km tolerance
        assert.ok(distance > 280 && distance < 285, `Expected ~281km, got ${distance}km`);
      });
    });

    describe('known distances (international)', () => {
      it('should calculate New York to Los Angeles distance (~3944 km)', () => {
        // New York: 40.7128°N, -74.0060°W
        // Los Angeles: 34.0522°N, -118.2437°W
        // Expected: ~3944 km
        const distance = calculator.haversine(40.7128, -74.0060, 34.0522, -118.2437);
        
        // Allow 50km tolerance for large distances
        assert.ok(distance > 3900 && distance < 4000, `Expected ~3944km, got ${distance}km`);
      });

      it('should calculate London to Paris distance (~344 km)', () => {
        // London: 51.5074°N, -0.1278°W
        // Paris: 48.8566°N, 2.3522°E
        // Expected: ~344 km
        const distance = calculator.haversine(51.5074, -0.1278, 48.8566, 2.3522);
        
        // Allow 5km tolerance
        assert.ok(distance > 340 && distance < 350, `Expected ~344km, got ${distance}km`);
      });

      it('should calculate Tokyo to Sydney distance (~7823 km)', () => {
        // Tokyo: 35.6762°N, 139.6503°E
        // Sydney: -33.8688°S, 151.2093°E
        // Expected: ~7823 km
        const distance = calculator.haversine(35.6762, 139.6503, -33.8688, 151.2093);
        
        // Allow 100km tolerance for very large distances
        assert.ok(distance > 7700 && distance < 7900, `Expected ~7823km, got ${distance}km`);
      });
    });

    describe('short distances', () => {
      it('should calculate distance between nearby points (~1 km)', () => {
        // Points approximately 1 km apart in Tel Aviv
        // Tel Aviv: 32.0853°N, 34.7818°E
        // Nearby: 32.0953°N, 34.7818°E (roughly 1 km north)
        const distance = calculator.haversine(32.0853, 34.7818, 32.0953, 34.7818);
        
        // ~1.11 km expected
        assert.ok(distance > 1.0 && distance < 1.2, `Expected ~1.1km, got ${distance}km`);
      });

      it('should calculate very short distance (~100m)', () => {
        // Points approximately 100m apart
        const distance = calculator.haversine(32.0853, 34.7818, 32.0862, 34.7818);
        
        // ~0.1 km expected
        assert.ok(distance > 0.08 && distance < 0.12, `Expected ~0.1km, got ${distance}km`);
      });
    });

    describe('edge cases', () => {
      it('should handle equator coordinates', () => {
        // Points on the equator, 1 degree apart
        const distance = calculator.haversine(0, 0, 0, 1);
        
        // 1 degree longitude at equator ≈ 111 km
        assert.ok(distance > 110 && distance < 112);
      });

      it('should handle north pole to south pole', () => {
        // North pole to south pole (180 degrees latitude difference)
        const distance = calculator.haversine(90, 0, -90, 0);
        
        // Half Earth's circumference ≈ 20,015 km
        assert.ok(distance > 19900 && distance < 20100, `Expected ~20015km, got ${distance}km`);
      });

      it('should handle antipodal points (opposite sides of Earth)', () => {
        // Points on opposite sides of Earth
        const distance = calculator.haversine(0, 0, 0, 180);
        
        // Half Earth's circumference ≈ 20,015 km
        assert.ok(distance > 19900 && distance < 20100, `Expected ~20015km, got ${distance}km`);
      });

      it('should handle negative coordinates (southern/western hemispheres)', () => {
        // Sydney to Buenos Aires
        // Sydney: -33.8688°S, 151.2093°E
        // Buenos Aires: -34.6037°S, -58.3816°W
        const distance = calculator.haversine(-33.8688, 151.2093, -34.6037, -58.3816);
        
        // Expected: ~11,800 km
        assert.ok(distance > 11700 && distance < 12000, `Expected ~11800km, got ${distance}km`);
      });

      it('should handle prime meridian crossing', () => {
        // Points crossing prime meridian (0° longitude)
        const distance = calculator.haversine(51.5074, -0.5, 51.5074, 0.5);
        
        // ~1 degree longitude at ~51°N ≈ 69 km
        assert.ok(distance > 65 && distance < 75);
      });

      it('should handle international date line crossing', () => {
        // Points near international date line (180° longitude)
        const distance = calculator.haversine(0, 179, 0, -179);
        
        // 2 degrees longitude at equator ≈ 222 km
        assert.ok(distance > 220 && distance < 225);
      });
    });

    describe('symmetry', () => {
      it('should be symmetric (distance A→B equals B→A)', () => {
        const distanceAB = calculator.haversine(32.0853, 34.7818, 31.7683, 35.2137);
        const distanceBA = calculator.haversine(31.7683, 35.2137, 32.0853, 34.7818);
        
        assert.equal(distanceAB, distanceBA);
      });

      it('should be symmetric for international distances', () => {
        const distanceNYLA = calculator.haversine(40.7128, -74.0060, 34.0522, -118.2437);
        const distanceLANY = calculator.haversine(34.0522, -118.2437, 40.7128, -74.0060);
        
        assert.equal(distanceNYLA, distanceLANY);
      });
    });

    describe('consistency with original implementation', () => {
      it('should produce identical results to original haversineDistance function', () => {
        // Original implementation logic for comparison
        const originalHaversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
          const R = 6371; // Earth's radius in km
          const toRad = (deg: number) => deg * (Math.PI / 180);
          
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);

          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;

          return distance;
        };

        // Test multiple coordinates
        const testCases = [
          [32.0853, 34.7818, 31.7683, 35.2137], // Tel Aviv to Jerusalem
          [40.7128, -74.0060, 34.0522, -118.2437], // New York to Los Angeles
          [0, 0, 0, 0], // Same point
          [0, 0, 0, 1], // Equator
          [51.5074, -0.1278, 48.8566, 2.3522], // London to Paris
        ];

        for (const [lat1, lon1, lat2, lon2] of testCases) {
          const newResult = calculator.haversine(lat1, lon1, lat2, lon2);
          const originalResult = originalHaversine(lat1, lon1, lat2, lon2);
          
          assert.equal(newResult, originalResult, 
            `Mismatch for (${lat1},${lon1}) to (${lat2},${lon2}): new=${newResult}, original=${originalResult}`);
        }
      });
    });
  });
});
