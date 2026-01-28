/**
 * Assistant Narrator Unit Tests
 * 
 * Tests schema validation, fallbacks, and constraint enforcement
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  NarratorOutputSchema,
  getFallbackMessage,
  type NarratorGateContext,
  type NarratorClarifyContext,
  type NarratorSummaryContext
} from './narrator.types.js';
import { validateNarratorOutput } from './assistant-narrator.js';

describe('Narrator Schema Validation', () => {
  it('should validate correct GATE_FAIL output', () => {
    const output = {
      type: 'GATE_FAIL' as const,
      message: 'Test message',
      question: null,
      suggestedAction: 'ASK_FOOD' as const,
      blocksSearch: true
    };

    assert.doesNotThrow(() => NarratorOutputSchema.parse(output));
  });

  it('should validate correct CLARIFY output', () => {
    const output = {
      type: 'CLARIFY' as const,
      message: 'Test message',
      question: 'Test question?',
      suggestedAction: 'ASK_LOCATION' as const,
      blocksSearch: true
    };

    assert.doesNotThrow(() => NarratorOutputSchema.parse(output));
  });

  it('should validate correct SUMMARY output', () => {
    const output = {
      type: 'SUMMARY' as const,
      message: 'Test summary',
      question: null,
      suggestedAction: 'NONE' as const,
      blocksSearch: false
    };

    assert.doesNotThrow(() => NarratorOutputSchema.parse(output));
  });

  it('should reject message longer than 240 chars', () => {
    const output = {
      type: 'GATE_FAIL' as const,
      message: 'a'.repeat(241),
      question: null,
      suggestedAction: 'ASK_FOOD' as const,
      blocksSearch: true
    };

    assert.throws(() => NarratorOutputSchema.parse(output));
  });

  it('should reject invalid type', () => {
    const output = {
      type: 'INVALID' as const,
      message: 'Test',
      question: null,
      suggestedAction: 'NONE' as const,
      blocksSearch: false
    };

    assert.throws(() => NarratorOutputSchema.parse(output));
  });

  it('should reject invalid suggestedAction', () => {
    const output = {
      type: 'SUMMARY' as const,
      message: 'Test',
      question: null,
      suggestedAction: 'INVALID_ACTION' as const,
      blocksSearch: false
    };

    assert.throws(() => NarratorOutputSchema.parse(output));
  });

  it('should reject missing required fields', () => {
    const output = {
      type: 'GATE_FAIL' as const,
      message: 'Test'
      // Missing question, suggestedAction, blocksSearch
    };

    assert.throws(() => NarratorOutputSchema.parse(output));
  });

  it('should reject extra fields (strict schema)', () => {
    const output = {
      type: 'GATE_FAIL' as const,
      message: 'Test',
      question: null,
      suggestedAction: 'ASK_FOOD' as const,
      blocksSearch: true,
      extraField: 'should fail'
    };

    assert.throws(() => NarratorOutputSchema.parse(output));
  });
});

describe('Fallback Messages', () => {
  it('should return GATE_FAIL fallback for NO_FOOD reason (Hebrew)', () => {
    const context: NarratorGateContext = {
      type: 'GATE_FAIL',
      reason: 'NO_FOOD',
      query: 'weather',
      language: 'he',
      locationKnown: false
    };

    const fallback = getFallbackMessage(context);

    assert.strictEqual(fallback.type, 'GATE_FAIL');
    assert.ok(fallback.message.includes('אוכל'));
    assert.strictEqual(fallback.question, null);
    assert.strictEqual(fallback.suggestedAction, 'ASK_FOOD');
    assert.strictEqual(fallback.blocksSearch, true);
  });

  it('should return GATE_FAIL fallback for UNCERTAIN_FOOD reason (English)', () => {
    const context: NarratorGateContext = {
      type: 'GATE_FAIL',
      reason: 'UNCERTAIN_FOOD',
      query: 'open now',
      language: 'en',
      locationKnown: false
    };

    const fallback = getFallbackMessage(context);

    assert.strictEqual(fallback.type, 'GATE_FAIL');
    assert.ok(fallback.message.includes('Not sure'));
    assert.strictEqual(fallback.question, null);
    assert.strictEqual(fallback.suggestedAction, 'ASK_FOOD');
    assert.strictEqual(fallback.blocksSearch, true);
  });

  it('should return CLARIFY fallback for MISSING_LOCATION reason', () => {
    const context: NarratorClarifyContext = {
      type: 'CLARIFY',
      reason: 'MISSING_LOCATION',
      query: 'pizza',
      language: 'he',
      locationKnown: false
    };

    const fallback = getFallbackMessage(context);

    assert.strictEqual(fallback.type, 'CLARIFY');
    assert.ok(fallback.message.includes('מיקום'));
    assert.notStrictEqual(fallback.question, null);
    assert.strictEqual(fallback.question, fallback.message);
    assert.strictEqual(fallback.suggestedAction, 'ASK_LOCATION');
    assert.strictEqual(fallback.blocksSearch, true);
  });

  it('should return CLARIFY fallback for MISSING_FOOD reason', () => {
    const context: NarratorClarifyContext = {
      type: 'CLARIFY',
      reason: 'MISSING_FOOD',
      query: 'near me',
      language: 'he',
      locationKnown: true
    };

    const fallback = getFallbackMessage(context);

    assert.strictEqual(fallback.type, 'CLARIFY');
    assert.ok(fallback.message.includes('מה אוכלים'));
    assert.notStrictEqual(fallback.question, null);
    assert.strictEqual(fallback.suggestedAction, 'ASK_FOOD');
    assert.strictEqual(fallback.blocksSearch, true);
  });

  it('should return SUMMARY fallback for zero results', () => {
    const context: NarratorSummaryContext = {
      type: 'SUMMARY',
      query: 'pizza',
      language: 'he',
      resultCount: 0,
      top3Names: [],
      openNowCount: 0,
      avgRating: null,
      appliedFilters: ['open_now']
    };

    const fallback = getFallbackMessage(context);

    assert.strictEqual(fallback.type, 'SUMMARY');
    assert.ok(fallback.message.includes('לא מצאתי'));
    assert.strictEqual(fallback.question, null);
    assert.strictEqual(fallback.suggestedAction, 'EXPAND_RADIUS');
    assert.strictEqual(fallback.blocksSearch, false);
  });

  it('should return SUMMARY fallback for successful results', () => {
    const context: NarratorSummaryContext = {
      type: 'SUMMARY',
      query: 'pizza',
      language: 'he',
      resultCount: 10,
      top3Names: ['Pizza Hut', 'Dominos', 'Local Pizza'],
      openNowCount: 5,
      avgRating: 4.2,
      appliedFilters: []
    };

    const fallback = getFallbackMessage(context);

    assert.strictEqual(fallback.type, 'SUMMARY');
    assert.ok(fallback.message.includes('10'));
    assert.ok(fallback.message.includes('Pizza Hut'));
    assert.strictEqual(fallback.question, null);
    assert.strictEqual(fallback.suggestedAction, 'NONE');
    assert.strictEqual(fallback.blocksSearch, false);
  });

  it('should use English fallback for "other" language', () => {
    const context: NarratorGateContext = {
      type: 'GATE_FAIL',
      reason: 'NO_FOOD',
      query: 'погода',
      language: 'other',
      locationKnown: false
    };

    const fallback = getFallbackMessage(context);

    assert.ok(fallback.message.includes('food search'));
    assert.ok(!fallback.message.includes('אוכל'));
  });
});

describe('Output Validation and Constraint Enforcement', () => {
  it('should enforce blocksSearch=true for CLARIFY type', () => {
    const output = {
      type: 'CLARIFY' as const,
      message: 'Test',
      question: 'Test?',
      suggestedAction: 'ASK_LOCATION' as const,
      blocksSearch: false // Wrong!
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.blocksSearch, true);
  });

  it('should remove question for non-CLARIFY types', () => {
    const output = {
      type: 'GATE_FAIL' as const,
      message: 'Test',
      question: 'Should be removed',
      suggestedAction: 'ASK_FOOD' as const,
      blocksSearch: true
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.question, null);
  });

  it('should add question for CLARIFY if missing', () => {
    const output = {
      type: 'CLARIFY' as const,
      message: 'Test message',
      question: null, // Missing!
      suggestedAction: 'ASK_LOCATION' as const,
      blocksSearch: true
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.question, 'Test message');
  });

  it('should not modify question for valid CLARIFY', () => {
    const output = {
      type: 'CLARIFY' as const,
      message: 'Test message',
      question: 'Original question?',
      suggestedAction: 'ASK_LOCATION' as const,
      blocksSearch: true
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.question, 'Original question?');
  });

  it('should truncate message longer than 240 chars', () => {
    const longMessage = 'a'.repeat(250);
    const output = {
      type: 'SUMMARY' as const,
      message: longMessage,
      question: null,
      suggestedAction: 'NONE' as const,
      blocksSearch: false
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.message.length, 240);
    assert.ok(validated.message.endsWith('...'));
  });

  it('should not modify valid output', () => {
    const output = {
      type: 'SUMMARY' as const,
      message: 'Valid summary message',
      question: null,
      suggestedAction: 'NONE' as const,
      blocksSearch: false
    };

    const validated = validateNarratorOutput(output);

    assert.deepStrictEqual(validated, output);
  });

  it('should handle SUMMARY with question (should remove)', () => {
    const output = {
      type: 'SUMMARY' as const,
      message: 'Summary',
      question: 'Should be removed',
      suggestedAction: 'NONE' as const,
      blocksSearch: false
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.question, null);
  });

  it('should handle GATE_FAIL with question (should remove)', () => {
    const output = {
      type: 'GATE_FAIL' as const,
      message: 'Not food',
      question: 'Should be removed',
      suggestedAction: 'ASK_FOOD' as const,
      blocksSearch: true
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.question, null);
  });
});

describe('Constraint Combinations', () => {
  it('should enforce all CLARIFY constraints together', () => {
    const output = {
      type: 'CLARIFY' as const,
      message: 'Test',
      question: null, // Missing
      suggestedAction: 'ASK_LOCATION' as const,
      blocksSearch: false // Wrong
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.blocksSearch, true);
    assert.strictEqual(validated.question, 'Test');
  });

  it('should handle message truncation with other constraints', () => {
    const longMessage = 'a'.repeat(250);
    const output = {
      type: 'CLARIFY' as const,
      message: longMessage,
      question: 'b'.repeat(250), // Also too long
      suggestedAction: 'ASK_LOCATION' as const,
      blocksSearch: false
    };

    const validated = validateNarratorOutput(output);

    assert.strictEqual(validated.message.length, 240);
    assert.strictEqual(validated.blocksSearch, true);
    assert.strictEqual(validated.question, 'b'.repeat(250)); // Question not truncated by validateNarratorOutput
  });
});

describe('Fallback Language Handling', () => {
  const testLanguages = ['he', 'en', 'other'] as const;

  testLanguages.forEach(lang => {
    it(`should return valid fallback for ${lang} language (GATE_FAIL)`, () => {
      const context: NarratorGateContext = {
        type: 'GATE_FAIL',
        reason: 'NO_FOOD',
        query: 'test',
        language: lang,
        locationKnown: false
      };

      const fallback = getFallbackMessage(context);

      assert.ok(fallback.message.length > 0);
      assert.ok(fallback.message.length <= 240);
      assert.doesNotThrow(() => NarratorOutputSchema.parse(fallback));
    });

    it(`should return valid fallback for ${lang} language (CLARIFY)`, () => {
      const context: NarratorClarifyContext = {
        type: 'CLARIFY',
        reason: 'MISSING_LOCATION',
        query: 'test',
        language: lang,
        locationKnown: false
      };

      const fallback = getFallbackMessage(context);

      assert.ok(fallback.message.length > 0);
      assert.ok(fallback.message.length <= 240);
      assert.doesNotThrow(() => NarratorOutputSchema.parse(fallback));
    });

    it(`should return valid fallback for ${lang} language (SUMMARY)`, () => {
      const context: NarratorSummaryContext = {
        type: 'SUMMARY',
        query: 'test',
        language: lang,
        resultCount: 5,
        top3Names: ['A', 'B', 'C'],
        openNowCount: 2,
        avgRating: 4.0,
        appliedFilters: []
      };

      const fallback = getFallbackMessage(context);

      assert.ok(fallback.message.length > 0);
      assert.ok(fallback.message.length <= 240);
      assert.doesNotThrow(() => NarratorOutputSchema.parse(fallback));
    });
  });
});
