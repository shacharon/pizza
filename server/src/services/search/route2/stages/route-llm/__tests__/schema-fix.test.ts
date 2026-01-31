/**
 * Schema Fix Tests - P0 Fix for OpenAI 400 errors
 * 
 * Validates that TEXTSEARCH_JSON_SCHEMA is correctly formed and prevents:
 * "400 Invalid schema for response_format 'response': Missing 'textQuery'"
 * 
 * Root Cause: 'as const' on root object made it immutable, potentially causing
 * issues when schema-converter tries to ensure additionalProperties: false
 * 
 * Fix: Removed 'as const' from root, kept it on individual type/enum values
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXTSEARCH_JSON_SCHEMA,
  NEARBY_JSON_SCHEMA,
  LANDMARK_JSON_SCHEMA,
  assertStrictSchema
} from '../static-schemas.js';

describe('Schema Fix - OpenAI Strict Mode Compliance', () => {
  describe('TEXTSEARCH_JSON_SCHEMA', () => {
    it('should have type="object"', () => {
      assert.strictEqual(TEXTSEARCH_JSON_SCHEMA.type, 'object');
    });

    it('should have properties object', () => {
      assert.ok(TEXTSEARCH_JSON_SCHEMA.properties);
      assert.strictEqual(typeof TEXTSEARCH_JSON_SCHEMA.properties, 'object');
    });

    it('should have required array', () => {
      assert.ok(Array.isArray(TEXTSEARCH_JSON_SCHEMA.required));
      assert.ok(TEXTSEARCH_JSON_SCHEMA.required.length > 0);
    });

    it('should have textQuery in properties', () => {
      assert.ok(TEXTSEARCH_JSON_SCHEMA.properties.textQuery);
      assert.strictEqual(TEXTSEARCH_JSON_SCHEMA.properties.textQuery.type, 'string');
    });

    it('should have textQuery in required array', () => {
      assert.ok(
        TEXTSEARCH_JSON_SCHEMA.required.includes('textQuery'),
        'textQuery must be in required array to prevent OpenAI 400 error'
      );
    });

    it('should have ALL properties in required array (OpenAI strict mode)', () => {
      const propertyKeys = Object.keys(TEXTSEARCH_JSON_SCHEMA.properties);
      const requiredKeys = TEXTSEARCH_JSON_SCHEMA.required;

      for (const propKey of propertyKeys) {
        assert.ok(
          requiredKeys.includes(propKey),
          `Property "${propKey}" must be in required array for OpenAI strict mode`
        );
      }
    });

    it('should have additionalProperties: false', () => {
      assert.strictEqual(TEXTSEARCH_JSON_SCHEMA.additionalProperties, false);
    });

    it('should pass assertStrictSchema validation', () => {
      assert.doesNotThrow(() => {
        assertStrictSchema(TEXTSEARCH_JSON_SCHEMA, 'TEXTSEARCH_JSON_SCHEMA');
      }, 'Schema should pass strict validation');
    });

    it('should be mutable (no root as const)', () => {
      // Test that we can modify additionalProperties (if needed by schema-converter)
      const schemaCopy = { ...TEXTSEARCH_JSON_SCHEMA };
      assert.doesNotThrow(() => {
        schemaCopy.additionalProperties = true;
        schemaCopy.additionalProperties = false;
      }, 'Schema should be mutable at root level');
    });

    it('should have all required fields for OpenAI structured outputs', () => {
      const requiredFields = [
        'providerMethod',
        'textQuery', // CRITICAL - must be in required
        'region',
        'language',
        'reason',
        'cuisineKey',
        'requiredTerms',
        'preferredTerms',
        'strictness',
        'typeHint'
      ];

      for (const field of requiredFields) {
        assert.ok(
          TEXTSEARCH_JSON_SCHEMA.required.includes(field),
          `Required field "${field}" must be in required array`
        );
        assert.ok(
          TEXTSEARCH_JSON_SCHEMA.properties[field],
          `Required field "${field}" must be in properties`
        );
      }
    });
  });

  describe('NEARBY_JSON_SCHEMA', () => {
    it('should have type="object"', () => {
      assert.strictEqual(NEARBY_JSON_SCHEMA.type, 'object');
    });

    it('should have ALL properties in required array', () => {
      const propertyKeys = Object.keys(NEARBY_JSON_SCHEMA.properties);
      const requiredKeys = NEARBY_JSON_SCHEMA.required;

      for (const propKey of propertyKeys) {
        assert.ok(
          requiredKeys.includes(propKey),
          `NEARBY: Property "${propKey}" must be in required array`
        );
      }
    });

    it('should pass assertStrictSchema validation', () => {
      assert.doesNotThrow(() => {
        assertStrictSchema(NEARBY_JSON_SCHEMA, 'NEARBY_JSON_SCHEMA');
      });
    });
  });

  describe('LANDMARK_JSON_SCHEMA', () => {
    it('should have type="object"', () => {
      assert.strictEqual(LANDMARK_JSON_SCHEMA.type, 'object');
    });

    it('should have ALL properties in required array', () => {
      const propertyKeys = Object.keys(LANDMARK_JSON_SCHEMA.properties);
      const requiredKeys = LANDMARK_JSON_SCHEMA.required;

      for (const propKey of propertyKeys) {
        assert.ok(
          requiredKeys.includes(propKey),
          `LANDMARK: Property "${propKey}" must be in required array`
        );
      }
    });

    it('should pass assertStrictSchema validation', () => {
      assert.doesNotThrow(() => {
        assertStrictSchema(LANDMARK_JSON_SCHEMA, 'LANDMARK_JSON_SCHEMA');
      });
    });
  });
});

describe('Schema Fix - Regression Prevention', () => {
  it('should catch if textQuery is missing from required', () => {
    const badSchema = {
      type: 'object',
      properties: {
        textQuery: { type: 'string' },
        region: { type: 'string' }
      },
      required: ['region'], // Missing textQuery
      additionalProperties: false
    };

    assert.throws(() => {
      assertStrictSchema(badSchema, 'badSchema');
    }, /textQuery/);
  });

  it('should catch if any property is missing from required', () => {
    const badSchema = {
      type: 'object',
      properties: {
        fieldA: { type: 'string' },
        fieldB: { type: 'string' },
        fieldC: { type: 'string' }
      },
      required: ['fieldA', 'fieldB'], // Missing fieldC
      additionalProperties: false
    };

    assert.throws(() => {
      assertStrictSchema(badSchema, 'badSchema');
    }, /fieldC/);
  });

  it('should catch if properties is missing', () => {
    const badSchema = {
      type: 'object',
      required: [],
      additionalProperties: false
    };

    assert.throws(() => {
      assertStrictSchema(badSchema as any, 'badSchema');
    }, /properties/);
  });

  it('should catch if required is not an array', () => {
    const badSchema = {
      type: 'object',
      properties: {
        field: { type: 'string' }
      },
      required: 'field', // Should be array
      additionalProperties: false
    };

    assert.throws(() => {
      assertStrictSchema(badSchema as any, 'badSchema');
    }, /required.*array/);
  });
});
