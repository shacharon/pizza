/**
 * TextSearch Schema Validation Tests
 * 
 * Tests that TEXTSEARCH_JSON_SCHEMA is correctly formed and prevents OpenAI 400 errors
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TEXTSEARCH_JSON_SCHEMA,
  NEARBY_JSON_SCHEMA,
  LANDMARK_JSON_SCHEMA,
  assertStrictSchema
} from '../static-schemas.js';

describe('TextSearch Schema Validation', () => {
  describe('TEXTSEARCH_JSON_SCHEMA structure', () => {
    it('should have required "type" field set to "object"', () => {
      assert.strictEqual(TEXTSEARCH_JSON_SCHEMA.type, 'object');
    });

    it('should have "properties" object', () => {
      assert.ok(TEXTSEARCH_JSON_SCHEMA.properties);
      assert.strictEqual(typeof TEXTSEARCH_JSON_SCHEMA.properties, 'object');
    });

    it('should have "required" array', () => {
      assert.ok(Array.isArray(TEXTSEARCH_JSON_SCHEMA.required));
      assert.ok(TEXTSEARCH_JSON_SCHEMA.required.length > 0);
    });

    it('should have "additionalProperties" set to false', () => {
      assert.strictEqual(TEXTSEARCH_JSON_SCHEMA.additionalProperties, false);
    });
  });

  describe('CRITICAL: textQuery field', () => {
    it('should have textQuery in properties', () => {
      assert.ok(TEXTSEARCH_JSON_SCHEMA.properties.textQuery);
    });

    it('should have textQuery in required array', () => {
      assert.ok(TEXTSEARCH_JSON_SCHEMA.required.includes('textQuery'));
    });

    it('should have textQuery with type "string"', () => {
      assert.strictEqual(TEXTSEARCH_JSON_SCHEMA.properties.textQuery.type, 'string');
    });

    it('should have textQuery with minLength constraint', () => {
      const textQuery = TEXTSEARCH_JSON_SCHEMA.properties.textQuery as any;
      assert.ok(textQuery.minLength >= 1);
    });
  });

  describe('Required fields validation', () => {
    const requiredFields = [
      'providerMethod',
      'textQuery',
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
      it(`should have "${field}" in required array`, () => {
        assert.ok(
          TEXTSEARCH_JSON_SCHEMA.required.includes(field),
          `Field "${field}" missing from required array`
        );
      });

      it(`should have "${field}" in properties`, () => {
        assert.ok(
          TEXTSEARCH_JSON_SCHEMA.properties[field],
          `Field "${field}" missing from properties`
        );
      });
    }
  });

  describe('OpenAI Structured Outputs compatibility', () => {
    it('should pass assertStrictSchema validation', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        assertStrictSchema(TEXTSEARCH_JSON_SCHEMA, 'TEXTSEARCH_JSON_SCHEMA');
      });
    });

    it('should have ALL properties in required array', () => {
      const propertyKeys = Object.keys(TEXTSEARCH_JSON_SCHEMA.properties);
      const requiredKeys = TEXTSEARCH_JSON_SCHEMA.required;

      for (const key of propertyKeys) {
        assert.ok(
          requiredKeys.includes(key),
          `Property "${key}" exists but not in required array (OpenAI strict mode violation)`
        );
      }
    });

    it('should NOT have extra fields in required that are not in properties', () => {
      const propertyKeys = Object.keys(TEXTSEARCH_JSON_SCHEMA.properties);
      const requiredKeys = TEXTSEARCH_JSON_SCHEMA.required;

      for (const key of requiredKeys) {
        assert.ok(
          propertyKeys.includes(key),
          `Required field "${key}" does not exist in properties`
        );
      }
    });
  });

  describe('Schema type definitions', () => {
    it('should have providerMethod with enum constraint', () => {
      const providerMethod = TEXTSEARCH_JSON_SCHEMA.properties.providerMethod as any;
      assert.ok(providerMethod.enum);
      assert.ok(providerMethod.enum.includes('textSearch'));
    });

    it('should have region with pattern constraint for ISO codes', () => {
      const region = TEXTSEARCH_JSON_SCHEMA.properties.region as any;
      assert.strictEqual(region.pattern, '^[A-Z]{2}$');
    });

    it('should have language with enum constraint', () => {
      const language = TEXTSEARCH_JSON_SCHEMA.properties.language as any;
      assert.ok(language.enum);
      assert.ok(language.enum.includes('he'));
      assert.ok(language.enum.includes('en'));
    });

    it('should have cuisineKey with nullable option', () => {
      const cuisineKey = TEXTSEARCH_JSON_SCHEMA.properties.cuisineKey as any;
      assert.strictEqual(cuisineKey.nullable, true);
    });

    it('should have strictness enum with STRICT and RELAX_IF_EMPTY', () => {
      const strictness = TEXTSEARCH_JSON_SCHEMA.properties.strictness as any;
      assert.ok(strictness.enum);
      assert.ok(strictness.enum.includes('STRICT'));
      assert.ok(strictness.enum.includes('RELAX_IF_EMPTY'));
    });

    it('should have typeHint enum with restaurant types', () => {
      const typeHint = TEXTSEARCH_JSON_SCHEMA.properties.typeHint as any;
      assert.ok(typeHint.enum);
      assert.ok(typeHint.enum.includes('restaurant'));
      assert.ok(typeHint.enum.includes('cafe'));
      assert.ok(typeHint.enum.includes('bar'));
      assert.ok(typeHint.enum.includes('any'));
    });
  });

  describe('Array fields', () => {
    it('should have requiredTerms as array type', () => {
      const requiredTerms = TEXTSEARCH_JSON_SCHEMA.properties.requiredTerms as any;
      assert.strictEqual(requiredTerms.type, 'array');
      assert.ok(requiredTerms.items);
      assert.strictEqual(requiredTerms.items.type, 'string');
    });

    it('should have preferredTerms as array type', () => {
      const preferredTerms = TEXTSEARCH_JSON_SCHEMA.properties.preferredTerms as any;
      assert.strictEqual(preferredTerms.type, 'array');
      assert.ok(preferredTerms.items);
      assert.strictEqual(preferredTerms.items.type, 'string');
    });
  });
});

describe('NEARBY_JSON_SCHEMA validation', () => {
  it('should pass assertStrictSchema validation', () => {
    assert.doesNotThrow(() => {
      assertStrictSchema(NEARBY_JSON_SCHEMA, 'NEARBY_JSON_SCHEMA');
    });
  });

  it('should have all properties in required array', () => {
    const propertyKeys = Object.keys(NEARBY_JSON_SCHEMA.properties);
    const requiredKeys = NEARBY_JSON_SCHEMA.required;

    for (const key of propertyKeys) {
      assert.ok(
        requiredKeys.includes(key),
        `NEARBY: Property "${key}" not in required array`
      );
    }
  });

  it('should have location object with lat/lng', () => {
    const location = NEARBY_JSON_SCHEMA.properties.location as any;
    assert.strictEqual(location.type, 'object');
    assert.ok(location.properties.lat);
    assert.ok(location.properties.lng);
    assert.ok(location.required.includes('lat'));
    assert.ok(location.required.includes('lng'));
  });
});

describe('LANDMARK_JSON_SCHEMA validation', () => {
  it('should pass assertStrictSchema validation', () => {
    assert.doesNotThrow(() => {
      assertStrictSchema(LANDMARK_JSON_SCHEMA, 'LANDMARK_JSON_SCHEMA');
    });
  });

  it('should have all properties in required array', () => {
    const propertyKeys = Object.keys(LANDMARK_JSON_SCHEMA.properties);
    const requiredKeys = LANDMARK_JSON_SCHEMA.required;

    for (const key of propertyKeys) {
      assert.ok(
        requiredKeys.includes(key),
        `LANDMARK: Property "${key}" not in required array`
      );
    }
  });

  it('should have geocodeQuery field', () => {
    assert.ok(LANDMARK_JSON_SCHEMA.properties.geocodeQuery);
    assert.ok(LANDMARK_JSON_SCHEMA.required.includes('geocodeQuery'));
  });
});

describe('assertStrictSchema helper', () => {
  it('should throw for schema missing properties', () => {
    const invalidSchema = {
      type: 'object',
      required: ['field1']
      // Missing 'properties'
    };

    assert.throws(
      () => assertStrictSchema(invalidSchema, 'TestSchema'),
      /missing 'properties' object/
    );
  });

  it('should throw for schema missing required array', () => {
    const invalidSchema = {
      type: 'object',
      properties: { field1: { type: 'string' } }
      // Missing 'required'
    };

    assert.throws(
      () => assertStrictSchema(invalidSchema, 'TestSchema'),
      /missing 'required' array/
    );
  });

  it('should throw for schema with properties not in required', () => {
    const invalidSchema = {
      type: 'object',
      properties: {
        field1: { type: 'string' },
        field2: { type: 'string' }
      },
      required: ['field1'] // field2 missing!
    };

    assert.throws(
      () => assertStrictSchema(invalidSchema, 'TestSchema'),
      /not in required array/
    );
  });

  it('should pass for valid strict schema', () => {
    const validSchema = {
      type: 'object',
      properties: {
        field1: { type: 'string' },
        field2: { type: 'number' }
      },
      required: ['field1', 'field2'],
      additionalProperties: false
    };

    assert.doesNotThrow(() => {
      assertStrictSchema(validSchema, 'ValidSchema');
    });
  });
});

describe('Schema regression prevention', () => {
  it('should prevent textQuery from being removed from required', () => {
    // This test will fail if someone accidentally removes textQuery from required
    const textQueryInProperties = 'textQuery' in TEXTSEARCH_JSON_SCHEMA.properties;
    const textQueryInRequired = TEXTSEARCH_JSON_SCHEMA.required.includes('textQuery');

    assert.ok(textQueryInProperties, 'REGRESSION: textQuery removed from properties!');
    assert.ok(textQueryInRequired, 'REGRESSION: textQuery removed from required array!');
    assert.strictEqual(
      textQueryInProperties && textQueryInRequired,
      true,
      'CRITICAL: textQuery must be in both properties AND required to prevent OpenAI 400 errors'
    );
  });

  it('should prevent schema from becoming non-strict', () => {
    // Ensure schema stays strict (all properties in required)
    const propertyCount = Object.keys(TEXTSEARCH_JSON_SCHEMA.properties).length;
    const requiredCount = TEXTSEARCH_JSON_SCHEMA.required.length;

    assert.strictEqual(
      propertyCount,
      requiredCount,
      `REGRESSION: Schema is not strict! Properties: ${propertyCount}, Required: ${requiredCount}`
    );
  });
});
