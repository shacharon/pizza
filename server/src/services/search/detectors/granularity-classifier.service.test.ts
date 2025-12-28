/**
 * Granularity Classifier Tests
 * Tests CITY/STREET/LANDMARK/AREA detection
 */

import { describe, it, expect } from '@jest/globals';
import { GranularityClassifier } from './granularity-classifier.service.js';
import type { ParsedIntent } from '../types/search.types.js';

describe('GranularityClassifier', () => {
  const classifier = new GranularityClassifier();

  describe('CITY Granularity', () => {
    it('should classify "pizza in Tel Aviv" as CITY', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Tel Aviv', coords: { lat: 32.0853, lng: 34.7818 } },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('CITY');
    });

    it('should classify "pizza in Gedera" as CITY', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Gedera', coords: { lat: 31.8, lng: 34.7 } },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('CITY');
    });

    it('should classify city search without place as CITY', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Jerusalem', coords: { lat: 31.7, lng: 35.2 } },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('CITY');
    });

    it('should classify Hebrew city search as CITY', () => {
      const intent: ParsedIntent = {
        query: 'פיצה',
        language: 'he',
        searchMode: 'textsearch',
        location: { city: 'תל אביב', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('CITY');
    });
  });

  describe('STREET Granularity', () => {
    it('should classify "pizza on Allenby" as STREET', () => {
      const intent: ParsedIntent = {
        query: 'pizza on Allenby',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv', 
          street: 'Allenby', 
          coords: { lat: 32.0653, lng: 34.7758 } 
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: true, streetName: 'Allenby' };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('STREET');
    });

    it('should classify "restaurants on Dizengoff" as STREET', () => {
      const intent: ParsedIntent = {
        query: 'restaurants on Dizengoff',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv', 
          street: 'Dizengoff', 
          coords: { lat: 32.08, lng: 34.77 } 
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: true, streetName: 'Dizengoff' };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('STREET');
    });

    it('should override other signals when street is detected', () => {
      const intent: ParsedIntent = {
        query: 'pizza on Rothschild',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv', 
          street: 'Rothschild',
          place: 'Some Place', // Has place but street takes priority
          coords: { lat: 32, lng: 34 } 
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: true, streetName: 'Rothschild' };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('STREET');
    });
  });

  describe('LANDMARK Granularity', () => {
    it('should classify "pizza near Azrieli Center" as LANDMARK', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv', 
          place: 'Azrieli Center',
          placeType: 'landmark',
          coords: { lat: 32.0744, lng: 34.7925 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('LANDMARK');
    });

    it('should classify "restaurants near Central Bus Station" as LANDMARK', () => {
      const intent: ParsedIntent = {
        query: 'restaurants',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv', 
          place: 'Central Bus Station',
          placeType: 'landmark',
          coords: { lat: 32.05, lng: 34.77 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('LANDMARK');
    });

    it('should classify POI searches as LANDMARK', () => {
      const intent: ParsedIntent = {
        query: 'food near university',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv', 
          place: 'Tel Aviv University',
          placeType: 'landmark',
          coords: { lat: 32.11, lng: 34.8 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('LANDMARK');
    });
  });

  describe('AREA Granularity', () => {
    it('should classify "pizza near me" as AREA', () => {
      const intent: ParsedIntent = {
        query: 'pizza near me',
        language: 'en',
        searchMode: 'nearbysearch',
        location: { coords: { lat: 32.0853, lng: 34.7818 }, radius: 5000 },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('AREA');
    });

    it('should classify searches with explicit radius as AREA', () => {
      const intent: ParsedIntent = {
        query: 'restaurants',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv',
          coords: { lat: 32, lng: 34 },
          radius: 10000 
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('AREA');
    });

    it('should classify nearbysearch mode as AREA', () => {
      const intent: ParsedIntent = {
        query: 'food nearby',
        language: 'en',
        searchMode: 'nearbysearch',
        location: { coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('AREA');
    });
  });

  describe('Priority and Fallback Logic', () => {
    it('should prioritize STREET over CITY', () => {
      const intent: ParsedIntent = {
        query: 'pizza on Allenby',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv',  // Has city
          street: 'Allenby', // And street - street wins
          coords: { lat: 32, lng: 34 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: true, streetName: 'Allenby' };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('STREET');
    });

    it('should prioritize STREET over LANDMARK', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          place: 'Azrieli Center',
          placeType: 'landmark',
          street: 'Menachem Begin', // Street detected
          coords: { lat: 32, lng: 34 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: true, streetName: 'Menachem Begin' };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('STREET');
    });

    it('should prioritize LANDMARK over CITY', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv',          // Has city
          place: 'Azrieli Center',   // And landmark - landmark wins
          placeType: 'landmark',
          coords: { lat: 32, lng: 34 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('LANDMARK');
    });

    it('should default to CITY for ambiguous cases', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { coords: { lat: 32, lng: 34 } }, // Only coords
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('CITY');
    });

    it('should default to CITY when location is empty', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: {},
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('CITY');
    });
  });

  describe('Edge Cases', () => {
    it('should handle place without placeType as non-landmark', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv',
          place: 'Some Place', // No placeType
          coords: { lat: 32, lng: 34 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      // Should fall back to CITY (not landmark without placeType)
      expect(granularity).toBe('CITY');
    });

    it('should handle nearbysearch without radius', () => {
      const intent: ParsedIntent = {
        query: 'pizza nearby',
        language: 'en',
        searchMode: 'nearbysearch',
        location: { coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('AREA');
    });

    it('should handle missing streetDetection gracefully', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Tel Aviv', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('CITY');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should correctly classify "pizza in gedera" (reported bug case)', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Gedera',
          coords: { lat: 31.8, lng: 34.7 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      // This should be CITY, not street-level grouping
      expect(granularity).toBe('CITY');
    });

    it('should correctly classify "sushi on rothschild tel aviv"', () => {
      const intent: ParsedIntent = {
        query: 'sushi',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv',
          street: 'Rothschild Boulevard',
          coords: { lat: 32.0653, lng: 34.7758 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: true, streetName: 'Rothschild Boulevard' };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('STREET');
    });

    it('should correctly classify "restaurants near azrieli"', () => {
      const intent: ParsedIntent = {
        query: 'restaurants',
        language: 'en',
        searchMode: 'textsearch',
        location: { 
          city: 'Tel Aviv',
          place: 'Azrieli',
          placeType: 'landmark',
          coords: { lat: 32.0744, lng: 34.7925 }
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('LANDMARK');
    });

    it('should correctly classify "food near me 5km"', () => {
      const intent: ParsedIntent = {
        query: 'food',
        language: 'en',
        searchMode: 'nearbysearch',
        location: { 
          coords: { lat: 32, lng: 34 },
          radius: 5000
        },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      const granularity = classifier.classify(intent, streetDetection);
      
      expect(granularity).toBe('AREA');
    });
  });

  describe('Consistency Tests', () => {
    it('should return consistent results for same input', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Tel Aviv', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };
      
      const streetDetection = { isStreet: false };
      
      const result1 = classifier.classify(intent, streetDetection);
      const result2 = classifier.classify(intent, streetDetection);
      const result3 = classifier.classify(intent, streetDetection);
      
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should always return one of the 4 valid granularity types', () => {
      const testCases: ParsedIntent[] = [
        { query: 'pizza', language: 'en', searchMode: 'textsearch', location: {}, filters: { openNow: false, dietary: [] } },
        { query: 'pizza', language: 'en', searchMode: 'textsearch', location: { city: 'TLV', coords: { lat: 32, lng: 34 } }, filters: { openNow: false, dietary: [] } },
        { query: 'pizza', language: 'en', searchMode: 'nearbysearch', location: { coords: { lat: 32, lng: 34 } }, filters: { openNow: false, dietary: [] } }
      ];
      
      const streetDetection = { isStreet: false };
      const validGranularities = ['CITY', 'STREET', 'LANDMARK', 'AREA'];
      
      testCases.forEach(intent => {
        const result = classifier.classify(intent, streetDetection);
        expect(validGranularities).toContain(result);
      });
    });
  });
});

