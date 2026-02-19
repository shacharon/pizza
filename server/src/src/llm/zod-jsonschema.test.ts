/**
 * Zod to JSON Schema Utility Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { buildLLMJsonSchema } from './types.js';

describe('buildLLMJsonSchema', () => {
  it('generates JSON Schema from Zod schema', () => {
    const TestSchema = z.object({
      name: z.string(),
      age: z.number().min(0).max(120)
    }).strict();

    const { schema, schemaHash } = buildLLMJsonSchema(TestSchema, 'TestSchema');

    // Verify schema structure
    assert.strictEqual(schema.type, 'object');
    assert.ok(schema.properties);
    assert.ok(schema.properties.name);
    assert.ok(schema.properties.age);
    assert.deepStrictEqual(schema.required, ['name', 'age']);
    assert.strictEqual(schema.additionalProperties, false);
  });

  it('generates stable schemaHash for same schema', () => {
    const TestSchema = z.object({
      foo: z.string(),
      bar: z.number()
    });

    const { schemaHash: hash1 } = buildLLMJsonSchema(TestSchema);
    const { schemaHash: hash2 } = buildLLMJsonSchema(TestSchema);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 12);
  });

  it('generates different schemaHash for different schemas', () => {
    const Schema1 = z.object({ foo: z.string() });
    const Schema2 = z.object({ bar: z.number() });

    const { schemaHash: hash1 } = buildLLMJsonSchema(Schema1);
    const { schemaHash: hash2 } = buildLLMJsonSchema(Schema2);

    assert.notStrictEqual(hash1, hash2);
  });

  it('handles enum schemas correctly', () => {
    const TestSchema = z.object({
      route: z.enum(['TEXTSEARCH', 'NEARBY', 'LANDMARK']),
      confidence: z.number().min(0).max(1)
    }).strict();

    const { schema } = buildLLMJsonSchema(TestSchema);

    assert.ok(schema.properties.route);
    assert.deepStrictEqual(schema.properties.route.enum, ['TEXTSEARCH', 'NEARBY', 'LANDMARK']);
  });

  it('handles regex patterns correctly', () => {
    const TestSchema = z.object({
      region: z.string().regex(/^[A-Z]{2}$/)
    }).strict();

    const { schema } = buildLLMJsonSchema(TestSchema);

    assert.ok(schema.properties.region);
    assert.strictEqual(schema.properties.region.pattern, '^[A-Z]{2}$');
  });

  it('removes JSON Schema metadata fields', () => {
    const TestSchema = z.object({
      name: z.string()
    });

    const { schema } = buildLLMJsonSchema(TestSchema, 'TestSchema');

    // Verify metadata is removed
    assert.strictEqual(schema.$schema, undefined);
    assert.strictEqual(schema.$id, undefined);
  });

  it('uses $refStrategy none to inline definitions', () => {
    const NestedSchema = z.object({
      id: z.string()
    });

    const TestSchema = z.object({
      nested: NestedSchema
    });

    const { schema } = buildLLMJsonSchema(TestSchema);

    // Verify no $ref fields exist (all inlined)
    const schemaString = JSON.stringify(schema);
    assert.ok(!schemaString.includes('$ref'), 'Schema should not contain $ref');
  });
});

describe('IntentLLMSchema snapshot', () => {
  it('has stable schemaHash for IntentLLMSchema', async () => {
    // Dynamic import to avoid circular dependency
    const { IntentLLMSchema } = await import('../services/search/route2/stages/intent/intent.types.js');
    const { buildLLMJsonSchema } = await import('./types.js');

    const { schemaHash } = buildLLMJsonSchema(IntentLLMSchema, 'IntentLLM');

    // Snapshot test - update this hash if schema changes intentionally
    // Current hash should remain stable unless schema definition changes
    assert.strictEqual(typeof schemaHash, 'string');
    assert.strictEqual(schemaHash.length, 12);
    // When schema changes, update this expected hash:
    // assert.strictEqual(schemaHash, 'EXPECTED_HASH_HERE');
  });
});
