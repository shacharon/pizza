/**
 * Static Schema Validation Tests
 * Ensures OpenAI response_format schemas are valid and parseable
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTSEARCH_JSON_SCHEMA, NEARBY_JSON_SCHEMA, LANDMARK_JSON_SCHEMA, assertStrictSchema } from './static-schemas.js';
import { TextSearchLLMResponseSchema, NearbyMappingSchema, LandmarkMappingSchema } from './schemas.js';

describe('Static JSON Schemas - OpenAI Compatibility', () => {
  /**
   * Test TextSearch schema structure
   * CRITICAL: OpenAI strict mode rules:
   * - ALL properties MUST be in the required array (including nullable fields)
   * - Use type: ['string', 'null'] for nullable fields (not nullable: true)
   * - additionalProperties: false is required
   */
  it('should have ALL TEXTSEARCH properties in required array per OpenAI strict mode', () => {
    const schema = TEXTSEARCH_JSON_SCHEMA;
    
    // Verify schema has required array
    assert.ok(schema.required, 'Schema must have required array');
    assert.ok(Array.isArray(schema.required), 'required must be an array');
    
    // CRITICAL: Verify textQuery is in required array (this was the bug)
    assert.ok(
      schema.required.includes('textQuery'),
      'textQuery MUST be in required array (this was the bug causing 400 error)'
    );
    
    // Get all property keys
    const propertyKeys = Object.keys(schema.properties);
    
    // OpenAI strict mode: ALL properties must be in required (including nullable)
    for (const key of propertyKeys) {
      assert.ok(
        schema.required.includes(key),
        `Property "${key}" MUST be in required array for OpenAI strict mode`
      );
    }
    
    // Verify required array length matches properties count
    assert.strictEqual(
      schema.required.length,
      propertyKeys.length,
      'required array length must equal properties count (OpenAI strict mode)'
    );
    
    // Verify cuisine enforcement fields are present in properties
    assert.ok(schema.properties.requiredTerms, 'Must have requiredTerms property');
    assert.ok(schema.properties.preferredTerms, 'Must have preferredTerms property');
    assert.ok(schema.properties.strictness, 'Must have strictness property');
    assert.ok(schema.properties.typeHint, 'Must have typeHint property');
    assert.ok(schema.properties.cuisineKey, 'Must have cuisineKey property');
    
    // Verify cuisineKey allows null via type array (not nullable: true)
    const cuisineKeyType = (schema.properties as any).cuisineKey.type;
    assert.ok(
      Array.isArray(cuisineKeyType) && cuisineKeyType.includes('null'),
      'cuisineKey type must be array including "null" (not nullable: true)'
    );
  });

  /**
   * Test that minimal valid TextSearch object passes Zod validation
   */
  it('should parse minimal valid TextSearch response with cuisine fields', () => {
    const minimalResponse = {
      providerMethod: 'textSearch',
      textQuery: 'מסעדות בשריות',
      region: 'IL',
      language: 'he',
      reason: 'explicit_cuisine',
      requiredTerms: ['בשרי'],
      preferredTerms: ['בקר', 'עוף'],
      strictness: 'STRICT',
      typeHint: 'restaurant'
    };

    // Should parse without errors
    const result = TextSearchLLMResponseSchema.safeParse(minimalResponse);
    
    assert.ok(result.success, `Schema validation failed: ${result.success ? '' : result.error.message}`);
    if (result.success) {
      assert.strictEqual(result.data.requiredTerms.length, 1, 'Should preserve requiredTerms');
      assert.strictEqual(result.data.preferredTerms.length, 2, 'Should preserve preferredTerms');
      assert.strictEqual(result.data.strictness, 'STRICT', 'Should preserve strictness');
      assert.strictEqual(result.data.typeHint, 'restaurant', 'Should preserve typeHint');
    }
  });

  /**
   * Test that TextSearch with empty arrays (defaults) is valid
   */
  it('should parse TextSearch response with empty cuisine arrays', () => {
    const responseWithDefaults = {
      providerMethod: 'textSearch',
      textQuery: 'מסעדות',
      region: 'IL',
      language: 'he',
      reason: 'default_textsearch',
      requiredTerms: [],  // Empty (default)
      preferredTerms: [],  // Empty (default)
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant'
    };

    const result = TextSearchLLMResponseSchema.safeParse(responseWithDefaults);
    
    assert.ok(result.success, 'Should accept empty arrays as defaults');
    if (result.success) {
      assert.strictEqual(result.data.requiredTerms.length, 0, 'Empty requiredTerms should be valid');
      assert.strictEqual(result.data.preferredTerms.length, 0, 'Empty preferredTerms should be valid');
    }
  });

  /**
   * Test NEARBY schema completeness
   * OpenAI strict mode: ALL properties (including nullable) must be in required
   */
  it('should have ALL NEARBY properties in required array per OpenAI strict mode', () => {
    const schema = NEARBY_JSON_SCHEMA;
    
    const propertyKeys = Object.keys(schema.properties);
    
    // OpenAI strict mode: ALL properties must be in required (including nullable)
    for (const key of propertyKeys) {
      assert.ok(
        schema.required.includes(key),
        `NEARBY property "${key}" MUST be in required array (OpenAI strict mode)`
      );
    }
    
    // Verify required array length matches properties count
    assert.strictEqual(
      schema.required.length,
      propertyKeys.length,
      'NEARBY required array length must equal properties count'
    );
  });

  /**
   * Test LANDMARK schema completeness
   * OpenAI strict mode: ALL properties (including nullable) must be in required
   */
  it('should have ALL LANDMARK properties in required array per OpenAI strict mode', () => {
    const schema = LANDMARK_JSON_SCHEMA;
    
    const propertyKeys = Object.keys(schema.properties);
    
    // OpenAI strict mode: ALL properties must be in required (including nullable)
    for (const key of propertyKeys) {
      assert.ok(
        schema.required.includes(key),
        `LANDMARK property "${key}" MUST be in required array (OpenAI strict mode)`
      );
    }
    
    // Verify required array length matches properties count
    assert.strictEqual(
      schema.required.length,
      propertyKeys.length,
      'LANDMARK required array length must equal properties count'
    );
  });

  /**
   * Test that schema matches Zod schema expectations
   */
  it('should have matching fields between JSON schema and Zod schema', () => {
    const jsonSchemaProps = Object.keys(TEXTSEARCH_JSON_SCHEMA.properties);
    
    // Create a test object with all required fields
    const testObject: any = {
      providerMethod: 'textSearch',
      textQuery: 'test',
      region: 'IL',
      language: 'he',
      reason: 'test',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant'
    };

    // Verify Zod schema can parse it
    const result = TextSearchLLMResponseSchema.safeParse(testObject);
    assert.ok(result.success, 'Zod schema should accept object with all JSON schema fields');
    
    // Verify all JSON schema properties can be parsed by Zod
    if (result.success) {
      for (const prop of jsonSchemaProps) {
        assert.ok(
          prop in result.data,
          `Zod schema should include property "${prop}" from JSON schema`
        );
      }
    }
  });

  /**
   * Test assertStrictSchema helper function
   */
  it('should validate TEXTSEARCH_JSON_SCHEMA with assertStrictSchema', () => {
    // Should not throw for valid schema
    assert.doesNotThrow(() => {
      assertStrictSchema(TEXTSEARCH_JSON_SCHEMA, 'TEXTSEARCH_JSON_SCHEMA');
    }, 'assertStrictSchema should not throw for valid TEXTSEARCH_JSON_SCHEMA');
  });

  it('should throw error for schema with missing required field (non-nullable)', () => {
    const invalidSchema = {
      type: 'object',
      properties: {
        field1: { type: 'string' },
        field2: { type: 'string' },  // Non-nullable, should be required
        field3: { type: ['string', 'null'] }  // Nullable, optional in required
      },
      required: ['field1'], // Missing field2 (which is non-nullable)
      additionalProperties: false
    };

    assert.throws(() => {
      assertStrictSchema(invalidSchema, 'invalidSchema');
    }, {
      message: /properties not in required array/
    }, 'Should throw error when non-nullable property is missing from required array');
  });

  it('should throw error for schema without properties', () => {
    const invalidSchema = {
      type: 'object',
      required: [],
      additionalProperties: false
    };

    assert.throws(() => {
      assertStrictSchema(invalidSchema, 'invalidSchema');
    }, {
      message: /missing 'properties' object/
    }, 'Should throw error when properties object is missing');
  });

  it('should throw error for schema without required array', () => {
    const invalidSchema = {
      type: 'object',
      properties: {
        field1: { type: 'string' }
      },
      additionalProperties: false
    };

    assert.throws(() => {
      assertStrictSchema(invalidSchema, 'invalidSchema');
    }, {
      message: /missing 'required' array/
    }, 'Should throw error when required array is missing');
  });

  it('should validate all route schemas with assertStrictSchema', () => {
    // All schemas should pass validation
    assert.doesNotThrow(() => {
      assertStrictSchema(TEXTSEARCH_JSON_SCHEMA, 'TEXTSEARCH_JSON_SCHEMA');
    }, 'TEXTSEARCH_JSON_SCHEMA should be valid');

    assert.doesNotThrow(() => {
      assertStrictSchema(NEARBY_JSON_SCHEMA, 'NEARBY_JSON_SCHEMA');
    }, 'NEARBY_JSON_SCHEMA should be valid');

    assert.doesNotThrow(() => {
      assertStrictSchema(LANDMARK_JSON_SCHEMA, 'LANDMARK_JSON_SCHEMA');
    }, 'LANDMARK_JSON_SCHEMA should be valid');
  });

  /**
   * REGRESSION TEST: Validate fix for "Invalid schema... 'required' ... Missing 'textQuery'"
   * This test specifically addresses the bug mentioned in the task
   */
  it('REGRESSION: textQuery must be in TEXTSEARCH required array (OpenAI 400 error fix)', () => {
    const schema = TEXTSEARCH_JSON_SCHEMA;
    
    // CRITICAL: textQuery must be in required array
    assert.ok(
      schema.required.includes('textQuery'),
      'BUG FIX: textQuery was missing from required array, causing OpenAI 400 error'
    );
    
    // Verify textQuery is defined in properties
    assert.ok(
      schema.properties.textQuery,
      'textQuery must be defined in properties'
    );
    
    // Verify textQuery has correct type (string, not nullable)
    const textQueryProp = (schema.properties as any).textQuery;
    assert.strictEqual(
      textQueryProp.type,
      'string',
      'textQuery must have type "string" (not nullable)'
    );
    
    // Verify textQuery has minLength constraint
    assert.ok(
      textQueryProp.minLength === 1,
      'textQuery must have minLength: 1 constraint'
    );
    
    // Count: required array length should match ALL properties (OpenAI strict mode)
    const propertyCount = Object.keys(schema.properties).length;
    assert.strictEqual(
      schema.required.length,
      propertyCount,
      `required array should have exactly ${propertyCount} fields (ALL properties per OpenAI strict mode)`
    );
  });

  /**
   * TEST: Verify OpenAI strict mode compatibility (nullable via type array, not nullable: true)
   */
  it('should use type array for nullable fields (OpenAI strict mode)', () => {
    // TEXTSEARCH: cuisineKey is nullable via type: ['string', 'null']
    const cuisineKeyType = (TEXTSEARCH_JSON_SCHEMA.properties as any).cuisineKey.type;
    assert.ok(
      Array.isArray(cuisineKeyType) && cuisineKeyType.includes('null'),
      'TEXTSEARCH cuisineKey must use type: [\'string\', \'null\'] (not nullable: true)'
    );
    
    // Verify cuisineKey IS in required (nullable fields still required in OpenAI strict mode)
    assert.ok(
      TEXTSEARCH_JSON_SCHEMA.required.includes('cuisineKey'),
      'TEXTSEARCH cuisineKey MUST be in required array (OpenAI strict mode)'
    );
    
    // NEARBY: cuisineKey and typeKey are nullable via type array
    const nearbyCuisineType = (NEARBY_JSON_SCHEMA.properties as any).cuisineKey.type;
    assert.ok(
      Array.isArray(nearbyCuisineType) && nearbyCuisineType.includes('null'),
      'NEARBY cuisineKey must use type array for nullable'
    );
    
    // LANDMARK: nullable fields use type array
    const landmarkIdType = (LANDMARK_JSON_SCHEMA.properties as any).landmarkId.type;
    assert.ok(
      Array.isArray(landmarkIdType) && landmarkIdType.includes('null'),
      'LANDMARK landmarkId must use type array for nullable'
    );
  });
});
