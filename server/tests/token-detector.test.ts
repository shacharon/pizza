/**
 * TokenDetectorService Tests
 * Tests single-token query detection
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TokenDetectorService } from '../src/services/search/detectors/token-detector.service.js';

describe('TokenDetectorService', () => {
  const detector = new TokenDetectorService();

  describe('Single token detection', () => {
    it('should detect single token', () => {
      const result = detector.detect('חניה');
      
      assert.strictEqual(result.isSingleToken, true);
    });

    it('should not detect multi-token as single', () => {
      const result = detector.detect('pizza with parking');
      
      assert.strictEqual(result.isSingleToken, false);
    });

    it('should handle whitespace correctly', () => {
      const result = detector.detect('  parking  ');
      
      assert.strictEqual(result.isSingleToken, true);
    });
  });

  describe('Constraint token detection', () => {
    it('should detect parking constraint (Hebrew)', () => {
      const result = detector.detect('חניה');
      
      assert.strictEqual(result.tokenType, 'CONSTRAINT');
      assert.strictEqual(result.constraintType, 'parking');
      assert.strictEqual(result.requiresClarification, true);
    });

    it('should detect parking constraint (English)', () => {
      const result = detector.detect('parking');
      
      assert.strictEqual(result.tokenType, 'CONSTRAINT');
      assert.strictEqual(result.constraintType, 'parking');
    });

    it('should detect kosher constraint', () => {
      const result = detector.detect('כשר');
      
      assert.strictEqual(result.tokenType, 'CONSTRAINT');
      assert.strictEqual(result.constraintType, 'kosher');
    });

    it('should detect open now constraint', () => {
      const result = detector.detect('פתוח');
      
      assert.strictEqual(result.tokenType, 'CONSTRAINT');
      assert.strictEqual(result.constraintType, 'openNow');
    });

    it('should detect gluten free constraint', () => {
      // Note: "ללא גלוטן" is a multi-word phrase, so it won't be detected as single token
      // Testing with single-word version that's in our keywords
      const result = detector.detect('glutenfree');
      
      assert.strictEqual(result.tokenType, 'CONSTRAINT');
      assert.strictEqual(result.constraintType, 'glutenFree');
    });

    it('should detect vegan constraint', () => {
      const result = detector.detect('טבעוני');
      
      assert.strictEqual(result.tokenType, 'CONSTRAINT');
      assert.strictEqual(result.constraintType, 'vegan');
    });

    it('should detect delivery constraint', () => {
      const result = detector.detect('משלוח');
      
      assert.strictEqual(result.tokenType, 'CONSTRAINT');
      assert.strictEqual(result.constraintType, 'delivery');
    });
  });

  describe('Cuisine keyword detection', () => {
    it('should detect pizza as cuisine', () => {
      const result = detector.detect('pizza');
      
      assert.strictEqual(result.tokenType, 'CUISINE');
      assert.strictEqual(result.requiresClarification, false);
    });

    it('should detect sushi as cuisine', () => {
      const result = detector.detect('sushi');
      
      assert.strictEqual(result.tokenType, 'CUISINE');
    });

    it('should detect Hebrew cuisine keywords', () => {
      const result = detector.detect('פיצה');
      
      assert.strictEqual(result.tokenType, 'CUISINE');
    });
  });

  describe('Context awareness', () => {
    it('should not require clarification if context exists', () => {
      const context = {
        previousIntent: {
          query: 'restaurant',
          searchMode: 'textsearch' as const,
          filters: {
            openNow: true
          },
          language: 'en'
        }
      };

      const result = detector.detect('פתוח', context);
      
      // Should still detect it but not require clarification since context has openNow
      assert.strictEqual(result.requiresClarification, false);
    });

    it('should require clarification without context', () => {
      const result = detector.detect('parking');
      
      assert.strictEqual(result.requiresClarification, true);
    });
  });

  describe('Unknown token handling', () => {
    it('should mark unknown single token', () => {
      const result = detector.detect('RandomWord123');
      
      assert.strictEqual(result.isSingleToken, true);
      assert.strictEqual(result.tokenType, 'UNKNOWN');
    });

    it('should require clarification for unknown without context', () => {
      const result = detector.detect('SomeName');
      
      assert.strictEqual(result.requiresClarification, true);
    });

    it('should not require clarification for unknown with context', () => {
      const context = {
        previousIntent: {
          query: 'restaurant in tel aviv',
          searchMode: 'textsearch' as const,
          filters: {},
          language: 'en'
        }
      };

      const result = detector.detect('Margherita', context);
      
      assert.strictEqual(result.requiresClarification, false);
    });
  });
});

