/**
 * Landmark Schema Validation Tests
 * Verifies that LANDMARK_JSON_SCHEMA conforms to OpenAI strict mode requirements
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { LANDMARK_JSON_SCHEMA, assertStrictSchema } from '../static-schemas.js';

describe('LANDMARK_JSON_SCHEMA Validation', () => {
  it('should have additionalProperties: false for resolvedLatLng object type', () => {
    const schema = LANDMARK_JSON_SCHEMA;
    
    // Verify resolvedLatLng exists
    assert.ok(schema.properties.resolvedLatLng, 'resolvedLatLng property should exist');
    
    const resolvedLatLng = schema.properties.resolvedLatLng as any;
    
    // Verify anyOf structure for nullable object
    assert.ok(resolvedLatLng.anyOf, 'resolvedLatLng should use anyOf for nullable object');
    assert.strictEqual(resolvedLatLng.anyOf.length, 2, 'anyOf should have exactly 2 variants');
    
    // Find the object type in anyOf
    const objectVariant = resolvedLatLng.anyOf.find((v: any) => v.type === 'object');
    assert.ok(objectVariant, 'anyOf should contain an object variant');
    
    // CRITICAL: Verify additionalProperties: false
    assert.strictEqual(
      objectVariant.additionalProperties,
      false,
      'resolvedLatLng object type MUST have additionalProperties: false for OpenAI strict mode'
    );
    
    // Verify properties exist
    assert.ok(objectVariant.properties, 'Object variant should have properties');
    assert.ok(objectVariant.properties.lat, 'Object should have lat property');
    assert.ok(objectVariant.properties.lng, 'Object should have lng property');
    
    // Verify required fields
    assert.ok(Array.isArray(objectVariant.required), 'Object should have required array');
    assert.ok(objectVariant.required.includes('lat'), 'lat should be required');
    assert.ok(objectVariant.required.includes('lng'), 'lng should be required');
    
    // Verify null variant
    const nullVariant = resolvedLatLng.anyOf.find((v: any) => v.type === 'null');
    assert.ok(nullVariant, 'anyOf should contain a null variant');
  });

  it('should have keyword as nullable string', () => {
    const schema = LANDMARK_JSON_SCHEMA;
    const keyword = schema.properties.keyword as any;
    
    // Verify keyword allows null
    assert.ok(Array.isArray(keyword.type), 'keyword.type should be an array');
    assert.ok(keyword.type.includes('string'), 'keyword should allow string');
    assert.ok(keyword.type.includes('null'), 'keyword should allow null');
  });

  it('should pass OpenAI strict schema validation', () => {
    // This will throw if schema is invalid
    assert.doesNotThrow(
      () => assertStrictSchema(LANDMARK_JSON_SCHEMA, 'LANDMARK_JSON_SCHEMA'),
      'LANDMARK_JSON_SCHEMA should pass strict schema validation'
    );
  });

  it('should have all properties in required array', () => {
    const schema = LANDMARK_JSON_SCHEMA;
    const propertyKeys = Object.keys(schema.properties);
    const required = schema.required as string[];
    
    // Verify all properties are in required array
    for (const key of propertyKeys) {
      assert.ok(
        required.includes(key),
        `Property '${key}' should be in required array (OpenAI strict mode requirement)`
      );
    }
  });

  it('should have resolvedLatLng in required array', () => {
    const schema = LANDMARK_JSON_SCHEMA;
    const required = schema.required as string[];
    
    assert.ok(
      required.includes('resolvedLatLng'),
      'resolvedLatLng must be in required array even though it\'s nullable'
    );
  });
});
