/**
 * Unit tests for location-bias-validator
 * Tests validation and normalization of location bias coordinates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateLocationBias } from '../location-bias-validator.js';

// Mock logger
vi.mock('../../../../../../../lib/logger/structured-logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('validateLocationBias', () => {
  let logger: any;

  beforeEach(async () => {
    const loggerModule = await import('../../../../../../../lib/logger/structured-logger.js');
    logger = loggerModule.logger;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid coordinates', () => {
    it('should accept valid Tel Aviv coordinates', () => {
      const result = validateLocationBias({ lat: 32.0853, lng: 34.7818 }, 'req-123');
      
      expect(result).toEqual({ lat: 32.0853, lng: 34.7818 });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should accept valid Jerusalem coordinates', () => {
      const result = validateLocationBias({ lat: 31.7683, lng: 35.2137 }, 'req-456');
      
      expect(result).toEqual({ lat: 31.7683, lng: 35.2137 });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should accept valid coordinates at boundaries', () => {
      // North pole
      expect(validateLocationBias({ lat: 90, lng: 0 }, 'req-1')).toEqual({ lat: 90, lng: 0 });
      
      // South pole
      expect(validateLocationBias({ lat: -90, lng: 0 }, 'req-2')).toEqual({ lat: -90, lng: 0 });
      
      // International date line
      expect(validateLocationBias({ lat: 0, lng: 180 }, 'req-3')).toEqual({ lat: 0, lng: 180 });
      expect(validateLocationBias({ lat: 0, lng: -180 }, 'req-4')).toEqual({ lat: 0, lng: -180 });
    });
  });

  describe('Invalid coordinates - out of range', () => {
    it('should reject lat > 90', () => {
      const result = validateLocationBias({ lat: 91, lng: 34.7818 }, 'req-789');
      
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'bias_invalid_discarded',
          reason: 'out_of_range',
          lat: 91,
          lng: 34.7818
        }),
        expect.any(String)
      );
    });

    it('should reject lat < -90', () => {
      const result = validateLocationBias({ lat: -91, lng: 34.7818 }, 'req-790');
      
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should reject lng > 180', () => {
      const result = validateLocationBias({ lat: 32.0853, lng: 181 }, 'req-791');
      
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'bias_invalid_discarded',
          reason: 'out_of_range'
        }),
        expect.any(String)
      );
    });

    it('should reject lng < -180', () => {
      const result = validateLocationBias({ lat: 32.0853, lng: -181 }, 'req-792');
      
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Suspicious coordinates - potential swap (Israel region)', () => {
    it('should reject suspicious coordinates where lat ≈ lng ≈ 34-35 (likely swapped)', () => {
      // Both values close to each other and in 32-36 range
      const result = validateLocationBias({ lat: 34.5, lng: 34.7 }, 'req-swap-1');
      
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'bias_invalid_discarded',
          reason: 'suspicious_duplicate_values',
          lat: 34.5,
          lng: 34.7
        }),
        expect.any(String)
      );
    });

    it('should reject coordinates where lat and lng differ by < 0.5 in Israel range', () => {
      const result = validateLocationBias({ lat: 33.0, lng: 33.2 }, 'req-swap-2');
      
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should accept valid Israel coordinates even if both in 32-36 range but sufficiently different', () => {
      // Valid: lat ~32, lng ~35 (normal Israel coords)
      const result = validateLocationBias({ lat: 32.0, lng: 35.0 }, 'req-ok-1');
      
      expect(result).toEqual({ lat: 32.0, lng: 35.0 });
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('RequestId handling', () => {
    it('should work without requestId', () => {
      const result = validateLocationBias({ lat: 32.0853, lng: 34.7818 });
      
      expect(result).toEqual({ lat: 32.0853, lng: 34.7818 });
    });

    it('should log requestId when provided and validation fails', () => {
      validateLocationBias({ lat: 200, lng: 34.7818 }, 'test-req-id');
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-req-id'
        }),
        expect.any(String)
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle zero coordinates', () => {
      const result = validateLocationBias({ lat: 0, lng: 0 }, 'req-zero');
      
      expect(result).toEqual({ lat: 0, lng: 0 });
    });

    it('should handle negative coordinates (southern hemisphere)', () => {
      const result = validateLocationBias({ lat: -33.8688, lng: 151.2093 }, 'req-sydney');
      
      expect(result).toEqual({ lat: -33.8688, lng: 151.2093 });
    });

    it('should handle decimal precision', () => {
      const result = validateLocationBias({ lat: 32.085300001, lng: 34.781800002 }, 'req-precise');
      
      expect(result).toEqual({ lat: 32.085300001, lng: 34.781800002 });
    });
  });
});
