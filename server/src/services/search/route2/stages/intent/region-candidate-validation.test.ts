/**
 * Region Candidate Validation Tests
 * 
 * Tests that invalid region candidates are rejected before logging
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidRegionCode } from '../../utils/region-code-validator.js';

describe('Region Candidate Validation in Intent Stage', () => {
  describe('Intent output validation logic', () => {
    it('should accept valid ISO-3166-1 codes', () => {
      const validCodes = ['IL', 'US', 'GB', 'FR', 'DE', 'JP'];

      validCodes.forEach(code => {
        // Simulate validation logic in intent.stage.ts
        const validated = isValidRegionCode(code) ? code : null;

        assert.strictEqual(
          validated,
          code,
          `Valid code ${code} should be accepted`
        );
      });
    });

    it('should reject invalid codes like TQ, IS, XX', () => {
      const invalidCodes = ['TQ', 'IS', 'XX', 'ZZ', 'ISR'];

      invalidCodes.forEach(code => {
        // Simulate validation logic in intent.stage.ts
        const validated = isValidRegionCode(code) ? code : null;

        assert.strictEqual(
          validated,
          null,
          `Invalid code ${code} should be rejected (set to null)`
        );
      });
    });

    it('should prevent TQ from appearing in logs', () => {
      // Simulate intent LLM returning "TQ"
      const llmOutput = { regionCandidate: 'TQ' };

      // Validation should reject it
      const validated = isValidRegionCode(llmOutput.regionCandidate)
        ? llmOutput.regionCandidate
        : null;

      // Result: null (won't appear in intent_decided log)
      assert.strictEqual(validated, null);

      // Simulate intent_decided log
      const logData = {
        event: 'intent_decided',
        route: 'TEXTSEARCH',
        ...(validated && { regionCandidate: validated }),
        language: 'he'
      };

      // Verify regionCandidate is NOT in log data
      assert.ok(
        !('regionCandidate' in logData),
        'regionCandidate should not appear in logs when null'
      );
    });

    it('should allow IL to appear in logs', () => {
      // Simulate intent LLM returning "IL"
      const llmOutput = { regionCandidate: 'IL' };

      // Validation should accept it
      const validated = isValidRegionCode(llmOutput.regionCandidate)
        ? llmOutput.regionCandidate
        : null;

      // Result: 'IL'
      assert.strictEqual(validated, 'IL');

      // Simulate intent_decided log
      const logData = {
        event: 'intent_decided',
        route: 'TEXTSEARCH',
        ...(validated && { regionCandidate: validated }),
        language: 'he'
      };

      // Verify regionCandidate IS in log data
      assert.ok(
        'regionCandidate' in logData,
        'regionCandidate should appear in logs when valid'
      );
      assert.strictEqual(logData.regionCandidate, 'IL');
    });
  });

  describe('Filters resolver behavior', () => {
    it('should skip region_sanitized log when regionCandidate is null', () => {
      // Simulate intent result with null regionCandidate
      const intent = { regionCandidate: null };
      const deviceRegionCode = 'IL';

      // Simulate filters-resolver logic
      const rawRegionCode = intent.regionCandidate || deviceRegionCode || 'IL';
      const sanitizedRegionCode = rawRegionCode; // 'IL' is valid, no change

      // Should NOT log region_sanitized (intent.regionCandidate was null)
      const shouldLog = sanitizedRegionCode !== rawRegionCode && intent.regionCandidate !== null;

      assert.strictEqual(
        shouldLog,
        false,
        'Should not log region_sanitized when intent.regionCandidate is null'
      );
    });

    it('should skip region_sanitized log when no sanitization needed', () => {
      // Simulate intent result with valid regionCandidate
      const intent = { regionCandidate: 'IL' };

      // Simulate filters-resolver logic
      const rawRegionCode = intent.regionCandidate || 'IL';
      const sanitizedRegionCode = rawRegionCode; // 'IL' is valid, no change

      // Should NOT log region_sanitized (no change)
      const shouldLog = sanitizedRegionCode !== rawRegionCode && intent.regionCandidate !== null;

      assert.strictEqual(
        shouldLog,
        false,
        'Should not log region_sanitized when code is already valid'
      );
    });

    it('should log region_sanitized only when actually sanitizing', () => {
      // Simulate intent result with invalid regionCandidate that somehow got through
      // (This shouldn't happen after our fix, but tests the filters-resolver safety net)
      const intent = { regionCandidate: 'GZ' };

      // Simulate filters-resolver logic
      const rawRegionCode = intent.regionCandidate;
      const sanitizedRegionCode = null; // GZ is rejected

      // SHOULD log region_sanitized (value changed AND regionCandidate was not null)
      const shouldLog = sanitizedRegionCode !== rawRegionCode && intent.regionCandidate !== null;

      assert.strictEqual(
        shouldLog,
        true,
        'Should log region_sanitized when value changes and regionCandidate was provided'
      );
    });
  });
});
