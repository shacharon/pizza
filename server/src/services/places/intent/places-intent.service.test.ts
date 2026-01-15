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

  describe('Multi-language food types', () => {
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

    it('should map Hebrew meat restaurant to English canonical', async () => {
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'nearbysearch',
          query: 'meat restaurant',
          target: { kind: 'me', city: null, place: null, coords: null },
          filters: null
        },
        canonical: {
          category: 'meat restaurant',
          locationText: null
        },
        output: null
      });

      const result = await service.resolve('מסעדת בשרים');

      expect(result.search.query).toBe('meat restaurant');
      expect(result.search.target.kind).toBe('me');
      expect(result.canonical?.category).toBe('meat restaurant');
    });

    it('should map Hebrew dairy restaurant with location', async () => {
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'textsearch',
          query: 'dairy restaurant',
          target: { kind: 'city', city: 'גדרה', place: null, coords: null },
          filters: null
        },
        canonical: {
          category: 'dairy restaurant',
          locationText: 'גדרה'
        },
        output: null
      });

      const result = await service.resolve('מסעדה חלבית בגדרה');

      expect(result.search.query).toBe('dairy restaurant');
      expect(result.search.target.city).toBe('גדרה');
      expect(result.canonical?.category).toBe('dairy restaurant');
    });

    it('should map Hebrew hummus slang', async () => {
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'nearbysearch',
          query: 'hummus restaurant',
          target: { kind: 'me', city: null, place: null, coords: null },
          filters: null
        },
        canonical: {
          category: 'hummus restaurant',
          locationText: null
        },
        output: null
      });

      const result = await service.resolve('חומוסיה');

      expect(result.search.query).toBe('hummus restaurant');
      expect(result.search.target.kind).toBe('me');
      expect(result.canonical?.category).toBe('hummus restaurant');
    });

    it('should map Russian meat restaurant with location', async () => {
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'textsearch',
          query: 'meat restaurant',
          target: { kind: 'city', city: 'Гедере', place: null, coords: null },
          filters: null
        },
        canonical: {
          category: 'meat restaurant',
          locationText: 'Гедере'
        },
        output: null
      });

      const result = await service.resolve('мясной ресторан в Гедере');

      expect(result.search.query).toBe('meat restaurant');
      expect(result.search.target.city).toBe('Гедере');
      expect(result.canonical?.category).toBe('meat restaurant');
    });

    it('should keep gluten free as modifier, not in query', async () => {
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'textsearch',
          query: 'restaurant',
          target: { kind: 'city', city: 'גדרה', place: null, coords: null },
          filters: null
        },
        canonical: {
          category: 'restaurant',
          locationText: 'גדרה'
        },
        output: null
      });

      const result = await service.resolve('מסעדה ללא גלוטן בגדרה');

      expect(result.search.query).toBe('restaurant');
      expect(result.search.query).not.toContain('gluten');
      expect(result.search.query).not.toContain('גלוטן');
      expect(result.canonical?.category).toBe('restaurant');
    });

    it('should not include luxury modifier in query or location', async () => {
      mockLLM.completeJSON.mockResolvedValue({
        intent: 'find_food',
        provider: 'google_places',
        search: {
          mode: 'nearbysearch',
          query: 'meat restaurant',
          target: { kind: 'me', city: null, place: null, coords: null },
          filters: null
        },
        canonical: {
          category: 'meat restaurant',
          locationText: null
        },
        output: null
      });

      const result = await service.resolve('מסעדת בשרים יוקרתית');

      expect(result.search.query).toBe('meat restaurant');
      expect(result.search.query).not.toContain('יוקרתית');
      expect(result.search.query).not.toContain('luxury');
      expect(result.canonical?.category).toBe('meat restaurant');
    });
  });
});

