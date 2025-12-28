/**
 * Integration tests for PlacesIntentService
 * Intent Performance Policy: opennow:false guard
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PlacesIntentService } from './places-intent.service.js';
import type { LLMProvider } from '../../../llm/types.js';

describe('PlacesIntentService', () => {
  describe('opennow:false Guard', () => {
    let service: PlacesIntentService;
    let mockLLM: jest.Mocked<LLMProvider>;

    beforeEach(() => {
      // Create mock LLM provider
      mockLLM = {
        completeJSON: jest.fn(),
        complete: jest.fn()
      } as any;

      service = new PlacesIntentService();
      // Inject mock LLM
      (service as any).llm = mockLLM;
    });

    it('should remove opennow:false and add warning', async () => {
      // Mock LLM to return opennow:false
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'textsearch',
          query: 'פיצה',
          target: { kind: 'city', city: 'גדרה' },
          filters: { opennow: false } // Should be stripped
        }
      });

      const result = await service.resolve('פיצה סגור בגדרה');

      expect(result.search.filters?.opennow).toBeUndefined();
      expect((result as any).warnings).toContain('opennow_false_not_supported');
    });

    it('should preserve opennow:true', async () => {
      // Mock LLM to return opennow:true
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'textsearch',
          query: 'פיצה',
          target: { kind: 'city', city: 'תל אביב' },
          filters: { opennow: true }
        }
      });

      const result = await service.resolve('פיצה פתוח בתל אביב');

      expect(result.search.filters?.opennow).toBe(true);
      expect((result as any).warnings).toBeUndefined();
    });

    it('should handle missing opennow gracefully', async () => {
      // Mock LLM to return no opennow filter
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'textsearch',
          query: 'פיצה',
          target: { kind: 'city', city: 'חיפה' },
          filters: {}
        }
      });

      const result = await service.resolve('פיצה בחיפה');

      expect(result.search.filters?.opennow).toBeUndefined();
      expect((result as any).warnings).toBeUndefined();
    });

    it('should handle filters being undefined', async () => {
      // Mock LLM to return no filters at all
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'textsearch',
          query: 'המבורגר',
          target: { kind: 'city', city: 'באר שבע' }
        }
      });

      const result = await service.resolve('המבורגר בבאר שבע');

      expect(result.search.filters?.opennow).toBeUndefined();
      expect((result as any).warnings).toBeUndefined();
    });
  });

  describe('Heuristic Fallback', () => {
    it('should use heuristic fallback when LLM is not available', async () => {
      const service = new PlacesIntentService();
      // No LLM injected, should use heuristic

      const result = await service.resolve('pizza in tel aviv', 'en');

      expect(result.intent).toBe('find_food');
      expect(result.provider).toBe('google_places');
      expect(result.search.mode).toBe('textsearch');
      // Heuristic should preserve the query as-is
      expect(result.search.query).toContain('pizza');
    });
  });
});

