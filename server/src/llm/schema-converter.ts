/**
 * Schema Converter
 * Converts Zod schemas to JSON Schema for OpenAI Structured Outputs
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createHash } from 'crypto';
import { logger } from '../lib/logger/structured-logger.js';

/**
 * Schema version for Structured Outputs - increment when schema generation changes
 */
const SCHEMA_VERSION = 'v1';

/**
 * Conversion result
 */
export interface SchemaConversionResult {
  jsonSchema: any;
  schemaHash: string;
  schemaVersion: string;
}

/**
 * SchemaConverter
 * Handles Zod → JSON Schema conversion and validation
 */
export class SchemaConverter {
  /**
   * Convert Zod schema to JSON Schema
   * Returns validated JSON Schema with hash for tracking
   */
  convert<T extends z.ZodTypeAny>(
    schema: T,
    opts?: {
      traceId?: string;
      promptVersion?: string;
    }
  ): SchemaConversionResult {
    // Convert Zod schema to JSON Schema for OpenAI Structured Outputs
    const jsonSchema = zodToJsonSchema(schema as any, {
      target: 'openApi3',
      $refStrategy: 'none'
    }) as any;

    // Validate schema BEFORE calling OpenAI
    this.validateSchema(jsonSchema, opts);

    // Ensure additionalProperties is false for strict mode
    if (jsonSchema.additionalProperties !== false) {
      jsonSchema.additionalProperties = false;
    }

    const schemaHash = this.generateSchemaHash(jsonSchema);

    return {
      jsonSchema,
      schemaHash,
      schemaVersion: SCHEMA_VERSION
    };
  }

  /**
   * Convert static JSON Schema (bypass Zod conversion)
   */
  convertStatic(
    staticJsonSchema: any,
    opts?: {
      traceId?: string;
      promptVersion?: string;
    }
  ): SchemaConversionResult {
    // Validate schema
    this.validateSchema(staticJsonSchema, opts);

    // Ensure additionalProperties is false for strict mode
    if (staticJsonSchema.additionalProperties !== false) {
      staticJsonSchema.additionalProperties = false;
    }

    const schemaHash = this.generateSchemaHash(staticJsonSchema);

    return {
      jsonSchema: staticJsonSchema,
      schemaHash,
      schemaVersion: SCHEMA_VERSION
    };
  }

  /**
   * Validate JSON Schema before sending to OpenAI
   */
  private validateSchema(
    jsonSchema: any,
    opts?: { traceId?: string; promptVersion?: string }
  ): void {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      logger.error({
        traceId: opts?.traceId,
        schemaType: typeof jsonSchema,
        schemaValue: jsonSchema,
        promptVersion: opts?.promptVersion
      }, '[LLM] Invalid JSON Schema: schema is null or not an object');
      throw new Error('Invalid JSON Schema generated from Zod schema');
    }

    if (jsonSchema.type !== 'object') {
      logger.error({
        traceId: opts?.traceId,
        schemaType: jsonSchema.type,
        hasProperties: !!jsonSchema.properties,
        promptVersion: opts?.promptVersion
      }, '[LLM] Invalid JSON Schema: root type must be "object"');
      throw new Error(`Invalid JSON Schema: root type is "${jsonSchema.type}", expected "object"`);
    }
  }

  /**
   * Generate a stable hash of a JSON schema for correlation/debugging
   * Used to track which schema version caused issues
   */
  private generateSchemaHash(schema: any): string {
    const schemaString = JSON.stringify(schema, Object.keys(schema).sort());
    return createHash('sha256').update(schemaString).digest('hex').substring(0, 12);
  }

  /**
   * Get current schema version
   */
  getSchemaVersion(): string {
    return SCHEMA_VERSION;
  }
}
