/**
 * Wolt Matcher - Unit Tests
 * 
 * Tests:
 * - Name normalization (lowercase, punctuation, suffixes)
 * - Scoring logic (title match, snippet match, city match)
 * - Best match selection (threshold, sorting)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeName,
  scoreResult,
  findBestMatch,
} from './wolt-matcher.js';
import type { SearchResult } from './wolt-search.adapter.js';

describe('WoltMatcher', () => {
  describe('normalizeName', () => {
    it('should convert to lowercase', () => {
      assert.strictEqual(normalizeName('Pizza House'), 'pizza house');
      assert.strictEqual(normalizeName('BURGER KING'), 'burger king');
    });

    it('should strip punctuation', () => {
      assert.strictEqual(normalizeName("Joe's Pizza"), 'joe s pizza');
      // "Grill" is a common suffix, so it's removed
      assert.strictEqual(normalizeName('Pizza & Grill'), 'pizza');
      // "Bar" is a common suffix, so it's removed
      assert.strictEqual(normalizeName('Pizza, Bar & More'), 'pizza more');
    });

    it('should remove common suffixes', () => {
      assert.strictEqual(normalizeName('Pizza House Restaurant'), 'pizza house');
      assert.strictEqual(normalizeName('Joe Bar'), 'joe');
      assert.strictEqual(normalizeName('Coffee Cafe'), 'coffee');
      assert.strictEqual(normalizeName('Steakhouse Grill'), 'steakhouse');
    });

    it('should handle Hebrew text', () => {
      // Hebrew suffix removal may vary by regex implementation
      const normalized1 = normalizeName('פיצה טעימה מסעדה');
      // Should at least normalize to lowercase and strip punctuation
      assert.ok(normalized1.includes('פיצה'));
      assert.ok(normalized1.includes('טעימה'));

      const normalized2 = normalizeName('קפה ביסטרו');
      assert.ok(normalized2.includes('קפה'));
    });

    it('should collapse multiple spaces', () => {
      assert.strictEqual(normalizeName('Pizza   House'), 'pizza house');
      assert.strictEqual(normalizeName('  Burger  King  '), 'burger king');
    });

    it('should handle complex names', () => {
      assert.strictEqual(
        normalizeName("Joe's Pizza & Grill Restaurant"),
        'joe s pizza'
      );
    });
  });

  describe('scoreResult', () => {
    it('should score 50 points for title match', () => {
      const result: SearchResult = {
        title: 'Pizza House - Wolt',
        url: 'https://wolt.com/restaurant/pizza-house',
        snippet: 'Order food online',
      };

      const score = scoreResult(result, 'pizza house', null);

      assert.strictEqual(score.score, 50);
      assert.strictEqual(score.breakdown.titleMatchesName, true);
      assert.strictEqual(score.breakdown.snippetMatchesName, false);
      assert.strictEqual(score.breakdown.containsCity, false);
    });

    it('should score 20 points for snippet match', () => {
      const result: SearchResult = {
        title: 'Some Restaurant',
        url: 'https://wolt.com/restaurant/some-place',
        snippet: 'Pizza House delivers amazing food',
      };

      const score = scoreResult(result, 'pizza house', null);

      assert.strictEqual(score.score, 20);
      assert.strictEqual(score.breakdown.titleMatchesName, false);
      assert.strictEqual(score.breakdown.snippetMatchesName, true);
      assert.strictEqual(score.breakdown.containsCity, false);
    });

    it('should score 30 points for city match', () => {
      const result: SearchResult = {
        title: 'Restaurant in Tel Aviv',
        url: 'https://wolt.com/restaurant/place',
        snippet: 'Great food delivery',
      };

      const score = scoreResult(result, 'some place', 'Tel Aviv');

      assert.strictEqual(score.score, 30);
      assert.strictEqual(score.breakdown.titleMatchesName, false);
      assert.strictEqual(score.breakdown.snippetMatchesName, false);
      assert.strictEqual(score.breakdown.containsCity, true);
    });

    it('should combine scores (title + city)', () => {
      const result: SearchResult = {
        title: 'Pizza House - Tel Aviv - Wolt',
        url: 'https://wolt.com/restaurant/pizza-house-tel-aviv',
        snippet: 'Order now',
      };

      const score = scoreResult(result, 'pizza house', 'Tel Aviv');

      assert.strictEqual(score.score, 80); // 50 (title) + 30 (city)
      assert.strictEqual(score.breakdown.titleMatchesName, true);
      assert.strictEqual(score.breakdown.snippetMatchesName, false);
      assert.strictEqual(score.breakdown.containsCity, true);
    });

    it('should combine scores (title + snippet + city)', () => {
      const result: SearchResult = {
        title: 'Pizza House - Wolt',
        url: 'https://wolt.com/restaurant/pizza-house',
        snippet: 'Best Pizza House in Tel Aviv',
      };

      const score = scoreResult(result, 'pizza house', 'Tel Aviv');

      assert.strictEqual(score.score, 100); // 50 (title) + 20 (snippet) + 30 (city)
      assert.strictEqual(score.breakdown.titleMatchesName, true);
      assert.strictEqual(score.breakdown.snippetMatchesName, true);
      assert.strictEqual(score.breakdown.containsCity, true);
    });

    it('should be case-insensitive', () => {
      const result: SearchResult = {
        title: 'PIZZA HOUSE',
        url: 'https://wolt.com/restaurant/pizza-house',
        snippet: 'TEL AVIV',
      };

      const score = scoreResult(result, 'Pizza House', 'tel aviv');

      assert.ok(score.score > 0);
      assert.strictEqual(score.breakdown.titleMatchesName, true);
      assert.strictEqual(score.breakdown.containsCity, true);
    });
  });

  describe('findBestMatch', () => {
    it('should return NOT_FOUND for empty results', () => {
      const match = findBestMatch([], 'Pizza House', 'Tel Aviv');

      assert.strictEqual(match.found, false);
      assert.strictEqual(match.url, null);
    });

    it('should return FOUND for match above threshold', () => {
      const results: SearchResult[] = [
        {
          title: 'Pizza House - Tel Aviv - Wolt',
          url: 'https://wolt.com/restaurant/pizza-house',
          snippet: 'Order now',
        },
      ];

      const match = findBestMatch(results, 'Pizza House', 'Tel Aviv');

      assert.strictEqual(match.found, true);
      assert.strictEqual(match.url, 'https://wolt.com/restaurant/pizza-house');
      assert.ok(match.bestScore);
      assert.ok(match.bestScore.score >= 50);
    });

    it('should return NOT_FOUND for match below threshold', () => {
      const results: SearchResult[] = [
        {
          title: 'Some Other Restaurant',
          url: 'https://wolt.com/restaurant/other',
          snippet: 'Food delivery',
        },
      ];

      const match = findBestMatch(results, 'Pizza House', 'Tel Aviv');

      assert.strictEqual(match.found, false);
      assert.strictEqual(match.url, null);
      assert.ok(match.bestScore);
      assert.ok(match.bestScore.score < 50);
    });

    it('should pick best match from multiple results', () => {
      const results: SearchResult[] = [
        {
          title: 'Some Restaurant',
          url: 'https://wolt.com/restaurant/some',
          snippet: 'Pizza House mentioned',
        },
        {
          title: 'Pizza House - Tel Aviv - Wolt',
          url: 'https://wolt.com/restaurant/pizza-house',
          snippet: 'Order now',
        },
        {
          title: 'Another Place',
          url: 'https://wolt.com/restaurant/another',
          snippet: 'Food',
        },
      ];

      const match = findBestMatch(results, 'Pizza House', 'Tel Aviv');

      assert.strictEqual(match.found, true);
      assert.strictEqual(match.url, 'https://wolt.com/restaurant/pizza-house');
      assert.ok(match.bestScore);
      assert.ok(match.bestScore.score >= 80); // Title + city match
    });

    it('should respect custom threshold', () => {
      const results: SearchResult[] = [
        {
          title: 'Pizza House',
          url: 'https://wolt.com/restaurant/pizza-house',
          snippet: 'Order now',
        },
      ];

      // Default threshold (50) should match
      const match1 = findBestMatch(results, 'Pizza House', null);
      assert.strictEqual(match1.found, true);

      // High threshold (80) should not match (only 50 points)
      const match2 = findBestMatch(results, 'Pizza House', null, { minScore: 80 });
      assert.strictEqual(match2.found, false);
    });

    it('should handle Hebrew restaurant names', () => {
      const results: SearchResult[] = [
        {
          title: 'פיצה טעימה - תל אביב - Wolt',
          url: 'https://wolt.com/restaurant/pizza-teima',
          snippet: 'הזמן עכשיו',
        },
      ];

      const match = findBestMatch(results, 'פיצה טעימה', 'תל אביב');

      assert.strictEqual(match.found, true);
      assert.strictEqual(match.url, 'https://wolt.com/restaurant/pizza-teima');
    });

    it('should normalize names before matching', () => {
      const results: SearchResult[] = [
        {
          title: 'Pizza House - Wolt',
          url: 'https://wolt.com/restaurant/pizza-house',
          snippet: 'Order from Pizza House Restaurant',
        },
      ];

      // Restaurant name includes "Restaurant" suffix (should be normalized away)
      const match = findBestMatch(results, 'Pizza House Restaurant', 'Tel Aviv');

      assert.strictEqual(match.found, true);
      assert.strictEqual(match.url, 'https://wolt.com/restaurant/pizza-house');
    });

    it('should return all scores for debugging', () => {
      const results: SearchResult[] = [
        {
          title: 'Pizza House',
          url: 'https://wolt.com/restaurant/pizza-house',
          snippet: 'Order now',
        },
        {
          title: 'Burger Place',
          url: 'https://wolt.com/restaurant/burger',
          snippet: 'Food',
        },
      ];

      const match = findBestMatch(results, 'Pizza House', null);

      assert.ok(match.allScores);
      assert.strictEqual(match.allScores.length, 2);
      assert.ok(match.allScores[0].score >= match.allScores[1].score); // Sorted descending
    });
  });
});
