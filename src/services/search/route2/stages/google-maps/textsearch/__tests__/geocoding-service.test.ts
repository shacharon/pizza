/**
 * Unit tests for geocoding-service
 * Tests city geocoding: happy path, missing city, error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeCity } from '../geocoding-service.js';

// Mock dependencies
vi.mock('../../../../../../../utils/fetch-with-timeout.js', () => ({
  fetchWithTimeout: vi.fn()
}));

vi.mock('../../../../../../../lib/logger/structured-logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('geocodeCity', () => {
  let fetchWithTimeout: any;
  let logger: any;

  beforeEach(async () => {
    const fetchModule = await import('../../../../../../../utils/fetch-with-timeout.js');
    const loggerModule = await import('../../../../../../../lib/logger/structured-logger.js');
    fetchWithTimeout = fetchModule.fetchWithTimeout;
    logger = loggerModule.logger;
    vi.clearAllMocks();
  });

  describe('Happy path', () => {
    it('should return coordinates for valid city (Tel Aviv)', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              geometry: {
                location: {
                  lat: 32.0853,
                  lng: 34.7818
                }
              }
            }
          ]
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      const result = await geocodeCity('Tel Aviv', 'IL', 'fake-api-key', 'req-123');

      expect(result).toEqual({ lat: 32.0853, lng: 34.7818 });
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('address=Tel+Aviv'),
        expect.objectContaining({ method: 'GET' }),
        expect.objectContaining({
          timeoutMs: 8000,
          requestId: 'req-123',
          stage: 'google_maps',
          provider: 'google_geocoding'
        })
      );
    });

    it('should include region parameter when provided', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{ geometry: { location: { lat: 31.7683, lng: 35.2137 } } }]
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      await geocodeCity('Jerusalem', 'IL', 'fake-api-key', 'req-456');

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('region=il'),
        expect.anything(),
        expect.anything()
      );
    });

    it('should work without region parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{ geometry: { location: { lat: 40.7128, lng: -74.0060 } } }]
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      const result = await geocodeCity('New York', null, 'fake-api-key', 'req-789');

      expect(result).toEqual({ lat: 40.7128, lng: -74.0060 });
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.not.stringContaining('region='),
        expect.anything(),
        expect.anything()
      );
    });

    it('should return first result when multiple results returned', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            { geometry: { location: { lat: 32.0853, lng: 34.7818 } } },
            { geometry: { location: { lat: 32.0, lng: 34.8 } } }
          ]
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      const result = await geocodeCity('Tel Aviv', 'IL', 'fake-api-key', 'req-multi');

      // Should return first result
      expect(result).toEqual({ lat: 32.0853, lng: 34.7818 });
    });
  });

  describe('Missing city / ZERO_RESULTS', () => {
    it('should return null for ZERO_RESULTS status', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'ZERO_RESULTS',
          results: []
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      const result = await geocodeCity('NonExistentCity', 'IL', 'fake-api-key', 'req-none');

      expect(result).toBeNull();
      expect(logger.warn).not.toHaveBeenCalled(); // ZERO_RESULTS is not an error
    });

    it('should return null when results array is empty', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: []
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      const result = await geocodeCity('EmptyResults', 'IL', 'fake-api-key', 'req-empty');

      expect(result).toBeNull();
    });

    it('should return null when results is missing', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK'
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      const result = await geocodeCity('MissingResults', 'IL', 'fake-api-key', 'req-missing');

      expect(result).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-OK HTTP response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      await expect(
        geocodeCity('Test City', 'IL', 'fake-api-key', 'req-error')
      ).rejects.toThrow('Google Geocoding API HTTP 500');
    });

    it('should log and throw error for REQUEST_DENIED status', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'REQUEST_DENIED',
          error_message: 'API key invalid'
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      await expect(
        geocodeCity('Test City', 'IL', 'fake-api-key', 'req-denied')
      ).rejects.toThrow('REQUEST_DENIED');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'REQUEST_DENIED',
          errorMessage: 'API key invalid'
        }),
        expect.any(String)
      );
    });

    it('should log and throw error for INVALID_REQUEST status', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'INVALID_REQUEST',
          error_message: 'Missing address parameter'
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      await expect(
        geocodeCity('', 'IL', 'fake-api-key', 'req-invalid')
      ).rejects.toThrow('INVALID_REQUEST');
    });

    it('should log warning for non-OK/non-ZERO_RESULTS status but not throw (e.g., OVER_QUERY_LIMIT)', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OVER_QUERY_LIMIT',
          error_message: 'Quota exceeded',
          results: []
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      const result = await geocodeCity('Test City', 'IL', 'fake-api-key', 'req-quota');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'OVER_QUERY_LIMIT'
        }),
        expect.any(String)
      );
    });

    it('should propagate network errors', async () => {
      (fetchWithTimeout as any).mockRejectedValue(new Error('Network timeout'));

      await expect(
        geocodeCity('Test City', 'IL', 'fake-api-key', 'req-network')
      ).rejects.toThrow('Network timeout');
    });
  });

  describe('Request format', () => {
    it('should URL-encode city name with spaces', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{ geometry: { location: { lat: 32.0, lng: 34.8 } } }]
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      await geocodeCity('Tel Aviv-Yafo', 'IL', 'fake-api-key', 'req-spaces');

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('Tel+Aviv'),
        expect.anything(),
        expect.anything()
      );
    });

    it('should lowercase region code', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{ geometry: { location: { lat: 32.0, lng: 34.8 } } }]
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      await geocodeCity('Test', 'IL', 'fake-api-key', 'req-lowercase');

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('region=il'),
        expect.anything(),
        expect.anything()
      );
    });

    it('should use correct timeout (8000ms)', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{ geometry: { location: { lat: 32.0, lng: 34.8 } } }]
        })
      };

      (fetchWithTimeout as any).mockResolvedValue(mockResponse);

      await geocodeCity('Test', 'IL', 'fake-api-key', 'req-timeout');

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.objectContaining({ timeoutMs: 8000 })
      );
    });
  });
});
