/**
 * Unit tests for Dietary Hints - Gluten-Free SOFT Hinting
 * 
 * Tests confidence level computation without result removal
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGlutenFreeHint,
  attachDietaryHints,
  type PlaceDto,
  type ConfidenceLevel
} from '../src/services/search/route2/post-filters/dietary-hints.js';

describe('Dietary Hints - Gluten-Free', () => {
  describe('computeGlutenFreeHint - HIGH confidence', () => {
    it('should return HIGH for explicit "gluten-free" in name', () => {
      const place: PlaceDto = {
        name: 'Gluten-Free Bakery',
        tags: ['bakery']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      assert.ok(hint.matchedTerms.length > 0);
      assert.ok(hint.matchedTerms.includes('gluten-free'));
    });

    it('should return HIGH for "gluten free" (with space)', () => {
      const place: PlaceDto = {
        name: 'The Gluten Free Kitchen',
        tags: ['restaurant']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      assert.ok(hint.matchedTerms.includes('gluten free'));
    });

    it('should return HIGH for Hebrew "ללא גלוטן"', () => {
      const place: PlaceDto = {
        name: 'מאפייה ללא גלוטן',
        tags: ['bakery']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      assert.ok(hint.matchedTerms.includes('ללא גלוטן'));
    });

    it('should return HIGH for "celiac-friendly"', () => {
      const place: PlaceDto = {
        name: 'Celiac-Friendly Cafe',
        tags: ['cafe']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      assert.ok(hint.matchedTerms.includes('celiac-friendly'));
    });

    it('should return HIGH for Spanish "sin gluten"', () => {
      const place: PlaceDto = {
        name: 'Panadería Sin Gluten',
        tags: ['bakery']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      assert.ok(hint.matchedTerms.includes('sin gluten'));
    });

    it('should return HIGH for French "sans gluten"', () => {
      const place: PlaceDto = {
        name: 'Boulangerie Sans Gluten',
        tags: ['bakery']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      assert.ok(hint.matchedTerms.includes('sans gluten'));
    });

    it('should return HIGH for "GF" abbreviation', () => {
      const place: PlaceDto = {
        name: 'GF Bakery',
        tags: ['bakery']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      assert.ok(hint.matchedTerms.includes('gf-abbreviation'));
    });

    it('should be case-insensitive', () => {
      const place: PlaceDto = {
        name: 'GLUTEN-FREE PIZZA',
        tags: ['restaurant']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      assert.ok(hint.matchedTerms.length > 0);
    });
  });

  describe('computeGlutenFreeHint - MEDIUM confidence', () => {
    it('should return MEDIUM for "vegan" restaurant', () => {
      const place: PlaceDto = {
        name: 'Vegan Delight',
        tags: ['restaurant']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'MEDIUM');
      assert.ok(hint.matchedTerms.includes('vegan'));
    });

    it('should return MEDIUM for "health food" in name', () => {
      const place: PlaceDto = {
        name: 'Health Food Store',
        tags: ['health_food_store']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'MEDIUM');
      assert.ok(hint.matchedTerms.includes('health food'));
    });

    it('should return MEDIUM for vegan_restaurant type', () => {
      const place: PlaceDto = {
        name: 'Plant Based Kitchen',
        tags: ['vegan_restaurant', 'restaurant']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'MEDIUM');
      assert.ok(hint.matchedTerms.includes('type:vegan_restaurant'));
    });

    it('should return MEDIUM for "organic" in name', () => {
      const place: PlaceDto = {
        name: 'Organic Cafe',
        tags: ['cafe']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'MEDIUM');
      assert.ok(hint.matchedTerms.includes('organic'));
    });

    it('should return MEDIUM for "allergen-free"', () => {
      const place: PlaceDto = {
        name: 'Allergen-Free Kitchen',
        tags: ['restaurant']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'MEDIUM');
      assert.ok(hint.matchedTerms.includes('allergen-free'));
    });
  });

  describe('computeGlutenFreeHint - LOW confidence', () => {
    it('should return LOW for generic bakery with no gluten mention', () => {
      const place: PlaceDto = {
        name: 'Downtown Bakery',
        tags: ['bakery', 'food']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'LOW');
      assert.ok(hint.matchedTerms.includes('type:bakery'));
    });

    it('should return LOW for generic restaurant', () => {
      const place: PlaceDto = {
        name: 'Italian Restaurant',
        tags: ['restaurant']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'LOW');
      assert.ok(hint.matchedTerms.includes('type:restaurant'));
    });

    it('should return LOW for cafe', () => {
      const place: PlaceDto = {
        name: 'Corner Cafe',
        tags: ['cafe']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'LOW');
      assert.ok(hint.matchedTerms.includes('type:cafe'));
    });
  });

  describe('computeGlutenFreeHint - NONE confidence', () => {
    it('should return NONE for non-food establishment', () => {
      const place: PlaceDto = {
        name: 'City Bank',
        tags: ['bank', 'finance']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'NONE');
      assert.equal(hint.matchedTerms.length, 0);
    });

    it('should return NONE for place with no tags', () => {
      const place: PlaceDto = {
        name: 'Mystery Place',
        tags: []
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'NONE');
      assert.equal(hint.matchedTerms.length, 0);
    });

    it('should return NONE for retail store', () => {
      const place: PlaceDto = {
        name: 'Fashion Store',
        tags: ['clothing_store']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'NONE');
      assert.equal(hint.matchedTerms.length, 0);
    });

    it('should handle missing name gracefully', () => {
      const place: PlaceDto = {
        tags: ['unknown']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'NONE');
    });
  });

  describe('computeGlutenFreeHint - Edge cases', () => {
    it('should prioritize HIGH over MEDIUM signals', () => {
      const place: PlaceDto = {
        name: 'Gluten-Free Vegan Bakery',
        tags: ['bakery', 'vegan_restaurant']
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'HIGH');
      // Should include both HIGH and potentially found MEDIUM terms
      assert.ok(hint.matchedTerms.some(t =>
        t === 'gluten-free' || t === 'gluten free'
      ));
    });

    it('should handle empty strings', () => {
      const place: PlaceDto = {
        name: '',
        address: '',
        tags: []
      };

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'NONE');
    });

    it('should handle undefined fields', () => {
      const place: PlaceDto = {};

      const hint = computeGlutenFreeHint(place);

      assert.equal(hint.confidence, 'NONE');
    });
  });

  describe('attachDietaryHints', () => {
    it('should attach glutenFree hint when isGlutenFree is true', () => {
      const place: PlaceDto = {
        name: 'Gluten-Free Cafe',
        tags: ['cafe']
      };

      attachDietaryHints(place, true);

      assert.ok((place as any).dietaryHints);
      assert.ok((place as any).dietaryHints.glutenFree);
      assert.equal((place as any).dietaryHints.glutenFree.confidence, 'HIGH');
    });

    it('should NOT attach hints when isGlutenFree is null', () => {
      const place: PlaceDto = {
        name: 'Regular Cafe',
        tags: ['cafe']
      };

      attachDietaryHints(place, null);

      assert.ok(!(place as any).dietaryHints);
    });

    it('should NOT attach hints when isGlutenFree is false', () => {
      const place: PlaceDto = {
        name: 'Regular Cafe',
        tags: ['cafe']
      };

      attachDietaryHints(place, false);

      assert.ok(!(place as any).dietaryHints);
    });

    it('should initialize dietaryHints object if not present', () => {
      const place: PlaceDto = {
        name: 'Vegan Restaurant',
        tags: ['restaurant']
      };

      attachDietaryHints(place, true);

      assert.ok((place as any).dietaryHints);
      assert.equal(typeof (place as any).dietaryHints, 'object');
    });
  });

  describe('Multiple language support', () => {
    it('should detect gluten-free in mixed language names', () => {
      const places = [
        { name: 'Café ללא גלוטן', tags: ['cafe'] },
        { name: 'Restaurant Sin Gluten Paris', tags: ['restaurant'] },
        { name: 'Sans Gluten Bakery', tags: ['bakery'] }
      ];

      for (const place of places) {
        const hint = computeGlutenFreeHint(place);
        assert.equal(hint.confidence, 'HIGH', `Failed for: ${place.name}`);
      }
    });
  });

  describe('Integration scenarios', () => {
    it('should correctly classify real-world examples', () => {
      const testCases: Array<{
        place: PlaceDto;
        expectedConfidence: ConfidenceLevel;
        description: string;
      }> = [
          {
            place: { name: 'Mariposa Gluten-Free Bakery', tags: ['bakery'] },
            expectedConfidence: 'HIGH',
            description: 'Dedicated gluten-free bakery'
          },
          {
            place: { name: 'Tender Greens', tags: ['vegan_restaurant', 'health_food_restaurant'] },
            expectedConfidence: 'MEDIUM',
            description: 'Health-focused restaurant'
          },
          {
            place: { name: 'Pizza Hut', tags: ['restaurant', 'pizza_restaurant'] },
            expectedConfidence: 'LOW',
            description: 'Generic pizza chain'
          },
          {
            place: { name: 'Apple Store', tags: ['electronics_store'] },
            expectedConfidence: 'NONE',
            description: 'Non-food establishment'
          }
        ];

      for (const testCase of testCases) {
        const hint = computeGlutenFreeHint(testCase.place);
        assert.equal(
          hint.confidence,
          testCase.expectedConfidence,
          `Failed for: ${testCase.description}`
        );
      }
    });
  });
});
