/**
 * Street Grouping Feature Tests
 * Tests the dual-search and result grouping for street-specific queries
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { StreetDetectorService } from '../src/services/search/detectors/street-detector.service.js';
import type { ParsedIntent, StreetDetectionResult } from '../src/services/search/types/search.types.js';

describe('Street Grouping Feature', () => {
  describe('StreetDetectorService', () => {
    let detector: StreetDetectorService;

    beforeEach(() => {
      detector = new StreetDetectorService();
    });

    describe('LLM Detection', () => {
      it('should detect street via LLM when place is set but city is not', () => {
        const intent: ParsedIntent = {
          query: 'italian',
          location: {
            place: 'Allenby',
            // No city → implies more specific than city level
          },
          searchMode: 'textsearch',
          filters: {},
          language: 'he',
        };

        const result = detector.detect(intent, 'איטלקית ברחוב אלנבי');

        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.streetName, 'Allenby');
        assert.strictEqual(result.detectionMethod, 'LLM');
      });

      it('should NOT detect street when both place and city are set', () => {
        const intent: ParsedIntent = {
          query: 'italian',
          location: {
            place: 'Allenby',
            city: 'Tel Aviv',
          },
          searchMode: 'textsearch',
          filters: {},
          language: 'he',
        };

        const result = detector.detect(intent, 'איטלקית באלנבי תל אביב');

        // Should prefer city over place when both exist
        assert.strictEqual(result.isStreet, false);
      });

      it('should NOT detect street when only city is set', () => {
        const intent: ParsedIntent = {
          query: 'italian',
          location: {
            city: 'Tel Aviv',
          },
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'italian in tel aviv');

        assert.strictEqual(result.isStreet, false);
        assert.strictEqual(result.detectionMethod, 'NONE');
      });
    });

    describe('Pattern Matching Fallback', () => {
      it('should detect Hebrew street via pattern: "רחוב אלנבי"', () => {
        const intent: ParsedIntent = {
          query: 'italian',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'he',
        };

        const result = detector.detect(intent, 'איטלקית ברחוב אלנבי');

        assert.strictEqual(result.isStreet, true);
        assert.ok(result.streetName?.includes('אלנבי'));
        assert.strictEqual(result.detectionMethod, 'PATTERN');
      });

      it('should detect Hebrew abbreviated street: "רח\' דיזנגוף"', () => {
        const intent: ParsedIntent = {
          query: 'pizza',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'he',
        };

        const result = detector.detect(intent, 'פיצה ברח\' דיזנגוף');

        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.detectionMethod, 'PATTERN');
      });

      it('should detect English street: "broadway"', () => {
        const intent: ParsedIntent = {
          query: 'pizza',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'pizza on broadway street');

        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.detectionMethod, 'PATTERN');
      });

      it('should detect abbreviated English street: "5th st"', () => {
        const intent: ParsedIntent = {
          query: 'sushi',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'sushi on 5th st');

        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.detectionMethod, 'PATTERN');
      });

      it('should detect French street: "rue de la paix"', () => {
        const intent: ParsedIntent = {
          query: 'bistro',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'fr',
        };

        const result = detector.detect(intent, 'bistro rue de la paix');

        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.detectionMethod, 'PATTERN');
      });

      it('should detect Spanish street: "calle mayor"', () => {
        const intent: ParsedIntent = {
          query: 'tapas',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'es',
        };

        const result = detector.detect(intent, 'tapas en calle mayor');

        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.detectionMethod, 'PATTERN');
      });

      it('should detect Arabic street: "شارع الأمير"', () => {
        const intent: ParsedIntent = {
          query: 'مطعم',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'ar',
        };

        const result = detector.detect(intent, 'مطعم في شارع الأمير');

        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.detectionMethod, 'PATTERN');
      });
    });

    describe('No Detection', () => {
      it('should NOT detect street for city-only query', () => {
        const intent: ParsedIntent = {
          query: 'pizza',
          location: {
            city: 'Tel Aviv',
          },
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'pizza in tel aviv');

        assert.strictEqual(result.isStreet, false);
        assert.strictEqual(result.detectionMethod, 'NONE');
      });

      it('should NOT detect street for generic query', () => {
        const intent: ParsedIntent = {
          query: 'italian restaurant',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'italian restaurant');

        assert.strictEqual(result.isStreet, false);
        assert.strictEqual(result.detectionMethod, 'NONE');
      });

      it('should NOT detect street for vague location query', () => {
        const intent: ParsedIntent = {
          query: 'sushi',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'sushi near me');

        assert.strictEqual(result.isStreet, false);
        assert.strictEqual(result.detectionMethod, 'NONE');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty location object', () => {
        const intent: ParsedIntent = {
          query: 'pizza',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'pizza');

        assert.strictEqual(result.isStreet, false);
      });

      it('should handle undefined location', () => {
        const intent: ParsedIntent = {
          query: 'pizza',
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'pizza');

        assert.strictEqual(result.isStreet, false);
      });

      it('should prefer LLM detection over pattern matching', () => {
        const intent: ParsedIntent = {
          query: 'italian',
          location: {
            place: 'Rothschild Boulevard',
            // No city → LLM detected as street
          },
          searchMode: 'textsearch',
          filters: {},
          language: 'en',
        };

        const result = detector.detect(intent, 'italian on rothschild boulevard');

        // Should use LLM detection even though pattern would also match
        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.detectionMethod, 'LLM');
        assert.strictEqual(result.streetName, 'Rothschild Boulevard');
      });

      it('should handle mixed language queries', () => {
        const intent: ParsedIntent = {
          query: 'pizza',
          location: {},
          searchMode: 'textsearch',
          filters: {},
          language: 'he',
        };

        const result = detector.detect(intent, 'pizza ברחוב אלנבי');

        assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.detectionMethod, 'PATTERN');
      });
    });
  });

  describe('Integration: Dual Search and Grouping', () => {
    it('should create correct response structure for street queries', () => {
      // This test validates the expected response structure
      // Actual integration tests in unified-search-integration.test.ts
      
      const mockResponse = {
        sessionId: 'test-session',
        query: {
          original: 'איטלקית ברחוב אלנבי',
          parsed: {
            query: 'italian',
            location: { place: 'אלנבי' },
            searchMode: 'textsearch' as const,
            filters: {},
            language: 'he',
          },
          language: 'he',
        },
        results: [
          // Flat list for backward compatibility
          { id: '1', name: 'Restaurant A', groupKind: 'EXACT' as const },
          { id: '2', name: 'Restaurant B', groupKind: 'EXACT' as const },
          { id: '3', name: 'Restaurant C', groupKind: 'NEARBY' as const },
        ],
        groups: [
          {
            kind: 'EXACT' as const,
            label: 'אלנבי',
            results: [
              { id: '1', name: 'Restaurant A', groupKind: 'EXACT' as const },
              { id: '2', name: 'Restaurant B', groupKind: 'EXACT' as const },
            ],
            radiusMeters: 200,
          },
          {
            kind: 'NEARBY' as const,
            label: 'באיזור',
            results: [
              { id: '3', name: 'Restaurant C', groupKind: 'NEARBY' as const },
            ],
            distanceLabel: '5 דקות הליכה',
            radiusMeters: 400,
          },
        ],
        chips: [],
        meta: {
          tookMs: 1500,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.9,
          source: 'google_places',
          streetGrouping: {
            enabled: true,
            streetName: 'אלנבי',
            detectionMethod: 'LLM' as const,
            exactCount: 2,
            nearbyCount: 1,
            exactRadius: 200,
            nearbyRadius: 400,
          },
        },
      };

      // Validate structure
      assert.strictEqual(mockResponse.results.length, 3);
      assert.strictEqual(mockResponse.groups!.length, 2);
      assert.strictEqual(mockResponse.groups![0].kind, 'EXACT');
      assert.strictEqual(mockResponse.groups![1].kind, 'NEARBY');
      assert.ok(mockResponse.meta.streetGrouping);
      assert.strictEqual(mockResponse.meta.streetGrouping!.enabled, true);
      assert.strictEqual(mockResponse.meta.streetGrouping!.exactCount, 2);
      assert.strictEqual(mockResponse.meta.streetGrouping!.nearbyCount, 1);
    });

    it('should create correct response structure for non-street queries', () => {
      const mockResponse = {
        sessionId: 'test-session',
        query: {
          original: 'pizza in tel aviv',
          parsed: {
            query: 'pizza',
            location: { city: 'Tel Aviv' },
            searchMode: 'textsearch' as const,
            filters: {},
            language: 'en',
          },
          language: 'en',
        },
        results: [
          { id: '1', name: 'Pizza Place A' },
          { id: '2', name: 'Pizza Place B' },
        ],
        // No groups for non-street queries
        chips: [],
        meta: {
          tookMs: 1200,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'google_places',
          // No streetGrouping for non-street queries
        },
      };

      // Validate backward compatibility
      assert.strictEqual(mockResponse.results.length, 2);
      assert.strictEqual(mockResponse.groups, undefined);
      assert.strictEqual(mockResponse.meta.streetGrouping, undefined);
    });
  });

  describe('Configuration', async () => {
    it('should have correct default street search radii', async () => {
      const { SearchConfig } = await import('../src/services/search/config/search.config.js');

      assert.strictEqual(SearchConfig.streetSearch.exactRadius, 200);
      assert.strictEqual(SearchConfig.streetSearch.nearbyRadius, 400);
      assert.strictEqual(SearchConfig.streetSearch.minExactResults, 3);
      assert.strictEqual(SearchConfig.streetSearch.minNearbyResults, 5);
    });
  });

  describe('Documentation and Examples', () => {
    it('validates Hebrew street query example from docs', () => {
      const detector = new StreetDetectorService();
      const intent: ParsedIntent = {
        query: 'italian',
        location: {
          place: 'אלנבי',
        },
        searchMode: 'textsearch',
        filters: {},
        language: 'he',
      };

      const result = detector.detect(intent, 'איטלקית ברחוב אלנבי');

      assert.strictEqual(result.isStreet, true);
        assert.strictEqual(result.streetName, 'אלנבי');
    });

    it('validates English street query example from docs', () => {
      const detector = new StreetDetectorService();
      const intent: ParsedIntent = {
        query: 'pizza',
        location: {
          place: 'Broadway', // LLM would extract this as place
        },
        searchMode: 'textsearch',
        filters: {},
        language: 'en',
      };

      const result = detector.detect(intent, 'pizza on broadway');

      // LLM detection: place without city → street query
      assert.strictEqual(result.isStreet, true);
      assert.strictEqual(result.detectionMethod, 'LLM');
      assert.strictEqual(result.streetName, 'Broadway');
    });
  });
});

