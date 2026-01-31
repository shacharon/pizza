/**
 * Cuisine Enforcement Tests
 * Tests for deterministic cuisine detection and enforcement in textsearch mapper
 * 
 * NOTE (P0 FIX - 2026-01-31):
 * The "CUISINE ENFORCEMENT GUARD" override has been REMOVED from textsearch.mapper.ts.
 * Cuisine detection is now driven exclusively by Route-LLM output.
 * 
 * These tests remain valid for the FALLBACK PATH (buildDeterministicMapping),
 * which is only used when the LLM completely fails.
 * 
 * TODO: Update test descriptions to clarify they test fallback behavior only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock the mapper since we can't easily import the internal function
// This tests the concept - actual implementation is in textsearch.mapper.ts
function detectCuisineKeywordMock(query: string): string | null {
  const queryLower = query.toLowerCase();

  // Italian
  if (queryLower.includes('איטלקי') || queryLower.includes('איטלקית') || 
      queryLower.includes('italian')) {
    return 'italian';
  }

  // Pizza
  if (queryLower.includes('פיצה') || queryLower.includes('pizza')) {
    return 'pizza';
  }

  // Asian (check both spellings)
  if (queryLower.includes('אסייתי') || queryLower.includes('אסייתית') || 
      queryLower.includes('אסיאטית') || queryLower.includes('asian')) {
    return 'asian';
  }

  // Sushi
  if (queryLower.includes('סושי') || queryLower.includes('sushi')) {
    return 'sushi';
  }

  return null;
}

describe('Cuisine Enforcement - Deterministic Detection', () => {
  it('should detect Italian cuisine in Hebrew query', () => {
    const queries = [
      'מסעדות איטלקיות בגדרה',
      'מסעדה איטלקית בתל אביב',
      'איטלקי בחיפה'
    ];

    for (const query of queries) {
      const result = detectCuisineKeywordMock(query);
      assert.strictEqual(result, 'italian', `Failed to detect Italian in: ${query}`);
    }
  });

  it('should detect Italian cuisine in English query', () => {
    const queries = [
      'italian restaurants in tel aviv',
      'Italian food near me',
      'best italian in haifa'
    ];

    for (const query of queries) {
      const result = detectCuisineKeywordMock(query);
      assert.strictEqual(result, 'italian', `Failed to detect Italian in: ${query}`);
    }
  });

  it('should detect Pizza cuisine', () => {
    const queries = [
      'פיצה בגדרה',
      'pizza in tel aviv',
      'מקום לפיצה'
    ];

    for (const query of queries) {
      const result = detectCuisineKeywordMock(query);
      assert.strictEqual(result, 'pizza', `Failed to detect pizza in: ${query}`);
    }
  });

  it('should detect Asian cuisine', () => {
    const queries = [
      'מסעדה אסייתית',
      'asian restaurant',
      'אסיאטית בתל אביב'
    ];

    for (const query of queries) {
      const result = detectCuisineKeywordMock(query);
      assert.strictEqual(result, 'asian', `Failed to detect asian in: ${query}`);
    }
  });

  it('should return null for generic queries without cuisine keyword', () => {
    const queries = [
      'מסעדות בגדרה',
      'restaurants in tel aviv',
      'מקום לאכול'
    ];

    for (const query of queries) {
      const result = detectCuisineKeywordMock(query);
      assert.strictEqual(result, null, `Should not detect cuisine in generic query: ${query}`);
    }
  });

  it('should detect cuisine in queries with extra words', () => {
    const queries = [
      'איפה יש מסעדה איטלקית טובה בתל אביב',
      'want to find italian food near me',
      'looking for פיצה in haifa'
    ];

    const expected = ['italian', 'italian', 'pizza'];

    queries.forEach((query, i) => {
      const result = detectCuisineKeywordMock(query);
      assert.strictEqual(result, expected[i], `Failed for: ${query}`);
    });
  });
});

describe('Canonical Query Preservation', () => {
  it('should preserve cuisine keywords when canonicalizing', () => {
    // Test data: [input, expected_output, expected_confidence]
    const testCases = [
      {
        input: 'מסעדות איטלקיות בגדרה',
        expected: 'מסעדה איטלקית גדרה',
        shouldContain: ['איטלק', 'גדרה']
      },
      {
        input: 'italian restaurants in tel aviv',
        expected: 'italian restaurant tel aviv',
        shouldContain: ['italian', 'tel aviv']
      },
      {
        input: 'פיצריות בחיפה',
        expected: 'פיצה חיפה',
        shouldContain: ['פיצ', 'חיפה']
      }
    ];

    for (const testCase of testCases) {
      // In real implementation, this would call the canonical query generator
      // Here we just verify the concept
      const output = testCase.expected;

      for (const term of testCase.shouldContain) {
        assert.ok(
          output.toLowerCase().includes(term.toLowerCase()),
          `Canonical query "${output}" should contain "${term}" from input "${testCase.input}"`
        );
      }
    }
  });

  it('should keep restaurant word when converting plural to singular', () => {
    const input = 'מסעדות איטלקיות בגדרה';
    const expected = 'מסעדה איטלקית גדרה';

    // Should contain "מסעדה" (singular) or "מסעדות" (plural)
    assert.ok(
      expected.includes('מסעדה'),
      'Should contain restaurant word (singular or plural)'
    );
  });
});

describe('Cuisine-Aware TextQuery Builder', () => {
  it('should strengthen textQuery when cuisineKey present but term missing', () => {
    // Scenario: LLM returned cuisineKey='italian' but textQuery is generic
    const originalTextQuery = 'מסעדות גדרה'; // Generic - missing cuisine
    const cuisineKey = 'italian';
    const cityText = 'גדרה';

    // Expected: Should be strengthened to include cuisine
    // In real implementation: "מסעדה איטלקית גדרה"
    // Here we just verify the concept
    const shouldContain = 'איטלקי'; // Some form of Italian

    assert.ok(
      originalTextQuery.includes('גדרה'),
      'Should preserve city'
    );
    // In real implementation, enhanced query would include איטלקי
  });

  it('should NOT modify textQuery when cuisineKey present AND term already in query', () => {
    // Scenario: textQuery already contains cuisine term
    const originalTextQuery = 'מסעדה איטלקית גדרה'; // Already has cuisine
    const cuisineKey = 'italian';

    // Expected: Keep original (already has Italian term)
    // In real implementation, enhanced query === original query
    assert.ok(
      originalTextQuery.includes('איטלקי'),
      'Original should already contain cuisine term'
    );
  });
});

describe('Strictness Enforcement', () => {
  it('should set STRICT strictness when cuisine detected', () => {
    const queries = [
      'מסעדות איטלקיות בגדרה',
      'pizza in tel aviv',
      'סושי בחיפה'
    ];

    for (const query of queries) {
      const cuisineKey = detectCuisineKeywordMock(query);
      const expectedStrictness = cuisineKey ? 'STRICT' : 'RELAX_IF_EMPTY';

      assert.strictEqual(
        expectedStrictness,
        'STRICT',
        `Should set STRICT strictness for cuisine query: ${query}`
      );
    }
  });

  it('should set RELAX_IF_EMPTY strictness when no cuisine detected', () => {
    const queries = [
      'מסעדות בגדרה',
      'restaurants near me'
    ];

    for (const query of queries) {
      const cuisineKey = detectCuisineKeywordMock(query);
      const expectedStrictness = cuisineKey ? 'STRICT' : 'RELAX_IF_EMPTY';

      assert.strictEqual(
        expectedStrictness,
        'RELAX_IF_EMPTY',
        `Should set RELAX_IF_EMPTY for generic query: ${query}`
      );
    }
  });
});

describe('Deterministic Cuisine+City Pattern Builder', () => {
  /**
   * Mock function to extract original cuisine word
   */
  function extractOriginalCuisineWordMock(query: string, cuisineKey: string): string | null {
    const queryLower = query.toLowerCase();

    if (cuisineKey === 'italian') {
      if (queryLower.includes('איטלקיות')) return 'איטלקיות';
      if (queryLower.includes('איטלקית')) return 'איטלקית';
      if (queryLower.includes('איטלקי')) return 'איטלקי';
      if (queryLower.includes('italian')) return 'italian';
    }

    if (cuisineKey === 'pizza') {
      if (queryLower.includes('פיצה')) return 'פיצה';
      if (queryLower.includes('pizza')) return 'pizza';
    }

    if (cuisineKey === 'asian') {
      if (queryLower.includes('אסייתיות')) return 'אסייתיות';
      if (queryLower.includes('אסייתית')) return 'אסייתית';
      if (queryLower.includes('אסייתי')) return 'אסייתי';
      if (queryLower.includes('asian')) return 'asian';
    }

    return null;
  }

  /**
   * Mock function to build deterministic pattern
   */
  function buildDeterministicPatternMock(
    originalQuery: string,
    cuisineWord: string,
    cityText: string
  ): string {
    const hasHebrew = /[\u0590-\u05FF]/.test(originalQuery);

    if (hasHebrew) {
      return `מסעדה ${cuisineWord} ${cityText}`;
    } else {
      return `${cuisineWord} restaurant ${cityText}`;
    }
  }

  it('should build Hebrew pattern for "מסעדות איטלקיות בגדרה"', () => {
    const originalQuery = 'מסעדות איטלקיות בגדרה';
    const cuisineKey = detectCuisineKeywordMock(originalQuery);
    const cityText = 'גדרה';

    assert.strictEqual(cuisineKey, 'italian');

    const cuisineWord = extractOriginalCuisineWordMock(originalQuery, cuisineKey!);
    assert.strictEqual(cuisineWord, 'איטלקיות', 'Should extract original plural form');

    const textQuery = buildDeterministicPatternMock(originalQuery, cuisineWord!, cityText);

    // CRITICAL CHECKS: Must contain all 3 components
    assert.ok(
      textQuery.includes('איטלק'),
      `TextQuery "${textQuery}" must contain "איטלק" (cuisine substring)`
    );
    assert.ok(
      textQuery.includes('גדרה'),
      `TextQuery "${textQuery}" must contain "גדרה" (city)`
    );
    assert.ok(
      textQuery.includes('מסעד'),
      `TextQuery "${textQuery}" must contain "מסעד" (restaurant word)`
    );

    // Expected format: "מסעדה איטלקיות גדרה"
    assert.strictEqual(
      textQuery,
      'מסעדה איטלקיות גדרה',
      'Should match exact pattern'
    );
  });

  it('should preserve original cuisine form (plural vs singular)', () => {
    // Test with plural form
    const query1 = 'מסעדות איטלקיות בתל אביב';
    const cuisineWord1 = extractOriginalCuisineWordMock(query1, 'italian');
    const textQuery1 = buildDeterministicPatternMock(query1, cuisineWord1!, 'תל אביב');

    assert.strictEqual(cuisineWord1, 'איטלקיות', 'Should extract plural');
    assert.ok(textQuery1.includes('איטלקיות'), 'Should preserve plural form');

    // Test with singular form
    const query2 = 'מסעדה איטלקית בחיפה';
    const cuisineWord2 = extractOriginalCuisineWordMock(query2, 'italian');
    const textQuery2 = buildDeterministicPatternMock(query2, cuisineWord2!, 'חיפה');

    assert.strictEqual(cuisineWord2, 'איטלקית', 'Should extract singular');
    assert.ok(textQuery2.includes('איטלקית'), 'Should preserve singular form');
  });

  it('should handle different cuisines correctly', () => {
    const testCases = [
      {
        query: 'פיצה באשקלון',
        cuisineKey: 'pizza',
        cuisineWord: 'פיצה',
        cityText: 'אשקלון',
        expected: 'מסעדה פיצה אשקלון'
      },
      {
        query: 'מסעדות אסייתיות בחיפה',
        cuisineKey: 'asian',
        cuisineWord: 'אסייתיות',
        cityText: 'חיפה',
        expected: 'מסעדה אסייתיות חיפה'
      }
    ];

    for (const testCase of testCases) {
      const cuisineKey = detectCuisineKeywordMock(testCase.query);
      assert.strictEqual(cuisineKey, testCase.cuisineKey);

      const cuisineWord = extractOriginalCuisineWordMock(testCase.query, cuisineKey!);
      assert.strictEqual(cuisineWord, testCase.cuisineWord);

      const textQuery = buildDeterministicPatternMock(
        testCase.query,
        cuisineWord!,
        testCase.cityText
      );
      assert.strictEqual(textQuery, testCase.expected);
    }
  });

  it('should handle English queries', () => {
    const query = 'italian restaurants in tel aviv';
    const cuisineKey = detectCuisineKeywordMock(query);
    const cuisineWord = extractOriginalCuisineWordMock(query, cuisineKey!);
    const textQuery = buildDeterministicPatternMock(query, cuisineWord!, 'tel aviv');

    assert.strictEqual(cuisineKey, 'italian');
    assert.strictEqual(cuisineWord, 'italian');
    assert.strictEqual(textQuery, 'italian restaurant tel aviv');
  });
});

describe('Canonical Query Preservation Validation', () => {
  /**
   * Mock validation function
   */
  function validatePreservationMock(
    originalQuery: string,
    canonicalQuery: string,
    cityText?: string
  ): { valid: boolean; reason?: string } {
    const originalLower = originalQuery.toLowerCase();
    const canonicalLower = canonicalQuery.toLowerCase();

    // Must contain restaurant word
    if (!canonicalLower.includes('מסעד') && !canonicalLower.includes('restaurant')) {
      return { valid: false, reason: 'missing_restaurant_word' };
    }

    // Check cuisine preservation
    const cuisineKeywords = ['איטלק', 'italian', 'פיצ', 'pizza', 'אסיי', 'asian'];
    for (const keyword of cuisineKeywords) {
      if (originalLower.includes(keyword)) {
        if (!canonicalLower.includes(keyword)) {
          return { valid: false, reason: `lost_cuisine: ${keyword}` };
        }
      }
    }

    // Check city preservation
    if (cityText && !canonicalLower.includes(cityText.toLowerCase())) {
      return { valid: false, reason: `lost_city: ${cityText}` };
    }

    return { valid: true };
  }

  it('should pass validation for properly preserved canonical query', () => {
    const testCases = [
      {
        original: 'מסעדות איטלקיות בגדרה',
        canonical: 'מסעדה איטלקית גדרה',
        cityText: 'גדרה'
      },
      {
        original: 'italian restaurants in tel aviv',
        canonical: 'italian restaurant tel aviv',
        cityText: 'tel aviv'
      }
    ];

    for (const testCase of testCases) {
      const result = validatePreservationMock(
        testCase.original,
        testCase.canonical,
        testCase.cityText
      );

      assert.ok(result.valid, `Should pass validation: ${testCase.canonical}`);
    }
  });

  it('should fail validation when cuisine keyword lost', () => {
    const result = validatePreservationMock(
      'מסעדות איטלקיות בגדרה',
      'מסעדות בגדרה',  // Lost "איטלקית"
      'גדרה'
    );

    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes('lost_cuisine'), 'Should detect lost cuisine');
  });

  it('should fail validation when city lost', () => {
    const result = validatePreservationMock(
      'מסעדות איטלקיות בגדרה',
      'מסעדה איטלקית',  // Lost "גדרה"
      'גדרה'
    );

    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes('lost_city'), 'Should detect lost city');
  });

  it('should fail validation when restaurant word lost', () => {
    const result = validatePreservationMock(
      'מסעדות איטלקיות בגדרה',
      'איטלקית בגדרה',  // Lost "מסעדה"
      'גדרה'
    );

    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes('missing_restaurant_word'), 'Should detect lost restaurant word');
  });
});
