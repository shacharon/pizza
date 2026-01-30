/**
 * Static Schema Validation Tests
 * Ensures OpenAI response_format schemas are valid and parseable
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTSEARCH_JSON_SCHEMA, NEARBY_JSON_SCHEMA, LANDMARK_JSON_SCHEMA } from './static-schemas.js';
import { TextSearchLLMResponseSchema, NearbyMappingSchema, LandmarkMappingSchema } from './schemas.js';

describe('Static JSON Schemas - OpenAI Compatibility', () => {
  /**
   * Test TextSearch schema structure
   */
  it('should have all TEXTSEARCH properties in required array', () => {
    const schema = TEXTSEARCH_JSON_SCHEMA;
    
    // Verify schema has required array
    assert.ok(schema.required, 'Schema must have required array');
    assert.ok(Array.isArray(schema.required), 'required must be an array');
    
    // Get all property keys
    const propertyKeys = Object.keys(schema.properties);
    
    // Verify ALL properties are in required (OpenAI strict mode requirement)
    for (const key of propertyKeys) {
      assert.ok(
        schema.required.includes(key),
        `Property "${key}" must be in required array for OpenAI strict mode`
      );
    }
    
    // Verify cuisine enforcement fields are present
    assert.ok(schema.properties.requiredTerms, 'Must have requiredTerms property');
    assert.ok(schema.properties.preferredTerms, 'Must have preferredTerms property');
    assert.ok(schema.properties.strictness, 'Must have strictness property');
    assert.ok(schema.properties.typeHint, 'Must have typeHint property');
    
    // Verify cuisine enforcement fields are in required
    assert.ok(schema.required.includes('requiredTerms'), 'requiredTerms must be in required array');
    assert.ok(schema.required.includes('preferredTerms'), 'preferredTerms must be in required array');
    assert.ok(schema.required.includes('strictness'), 'strictness must be in required array');
    assert.ok(schema.required.includes('typeHint'), 'typeHint must be in required array');
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
   */
  it('should have all NEARBY properties in required array', () => {
    const schema = NEARBY_JSON_SCHEMA;
    
    const propertyKeys = Object.keys(schema.properties);
    
    for (const key of propertyKeys) {
      assert.ok(
        schema.required.includes(key),
        `NEARBY property "${key}" must be in required array`
      );
    }
  });

  /**
   * Test LANDMARK schema completeness
   */
  it('should have all LANDMARK properties in required array', () => {
    const schema = LANDMARK_JSON_SCHEMA;
    
    const propertyKeys = Object.keys(schema.properties);
    
    for (const key of propertyKeys) {
      assert.ok(
        schema.required.includes(key),
        `LANDMARK property "${key}" must be in required array`
      );
    }
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
});
