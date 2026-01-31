/**
 * Static JSON Schemas for Route-LLM Mappers
 * Manual definitions because zod-to-json-schema is broken with Zod v4
 */

import { createHash } from 'crypto';

// TextSearch JSON Schema - V4: Language Separation
// LANGUAGE SEPARATION: LLM extracts cuisineKey (canonical, language-independent)
// textQuery/requiredTerms generated deterministically from cuisineKey + searchLanguage
export const TEXTSEARCH_JSON_SCHEMA = {
    type: 'object',
    properties: {
        providerMethod: { type: 'string', enum: ['textSearch'] },
        // textQuery: Optional (will be generated deterministically post-LLM)
        textQuery: { type: 'string', minLength: 1 },
        region: { type: 'string', pattern: '^[A-Z]{2}$' },
        language: { type: 'string', enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] },
        reason: { type: 'string', minLength: 1 },
        // NEW: Canonical cuisine key (language-independent)
        cuisineKey: { 
            type: 'string', 
            enum: [
                'italian', 'asian', 'japanese', 'chinese', 'thai', 'indian',
                'mediterranean', 'middle_eastern', 'american', 'mexican', 'french',
                'seafood', 'steakhouse', 'pizza', 'sushi', 'burger',
                'vegan', 'vegetarian', 'kosher', 'dairy', 'meat', 'fish',
                'breakfast', 'cafe', 'bakery', 'dessert',
                'fast_food', 'fine_dining', 'casual_dining'
            ],
            nullable: true,
            default: null
        },
        // DEPRECATED: Generated from cuisineKey (kept for backward compatibility)
        requiredTerms: { 
            type: 'array', 
            items: { type: 'string' },
            default: []
        },
        preferredTerms: { 
            type: 'array', 
            items: { type: 'string' },
            default: []
        },
        strictness: { 
            type: 'string', 
            enum: ['STRICT', 'RELAX_IF_EMPTY'],
            default: 'RELAX_IF_EMPTY'
        },
        typeHint: { 
            type: 'string', 
            enum: ['restaurant', 'cafe', 'bar', 'any'],
            default: 'restaurant'
        }
    },
    required: ['providerMethod', 'textQuery', 'region', 'language', 'reason', 'cuisineKey', 'requiredTerms', 'preferredTerms', 'strictness', 'typeHint'],
    additionalProperties: false
} as const;

export const TEXTSEARCH_SCHEMA_HASH = 'textsearch_v4_language_separation';

// Nearby JSON Schema
// Apply similar logic to NEARBY and LANDMARK if they use anyOf
// Example for NEARBY (ensure no nulls in location):
export const NEARBY_JSON_SCHEMA = {
    type: 'object',
    properties: {
        providerMethod: { type: 'string', enum: ['nearbySearch'] },
        location: {
            type: 'object',
            properties: {
                lat: { type: 'number', minimum: -90, maximum: 90 },
                lng: { type: 'number', minimum: -180, maximum: 180 }
            },
            required: ['lat', 'lng'],
            additionalProperties: false
        },
        radiusMeters: { type: 'integer', minimum: 1, maximum: 50000 },
        keyword: { type: 'string', minLength: 1, maxLength: 80 },
        region: { type: 'string', pattern: '^[A-Z]{2}$' },
        language: { type: 'string', enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] },
        reason: { type: 'string', minLength: 1 },
        // NEW: Optional canonical keys for language independence
        cuisineKey: { type: 'string' },
        typeKey: { type: 'string' }
    },
    required: ['providerMethod', 'location', 'radiusMeters', 'keyword', 'region', 'language', 'reason'],
    additionalProperties: false
} as const;

export const NEARBY_SCHEMA_HASH = createHash('sha256')
    .update(JSON.stringify(NEARBY_JSON_SCHEMA))
    .digest('hex')
    .substring(0, 12);

// Landmark JSON Schema
export const LANDMARK_JSON_SCHEMA = {
    type: 'object',
    properties: {
        providerMethod: { type: 'string', enum: ['landmarkPlan'] },
        geocodeQuery: { type: 'string', minLength: 1, maxLength: 120 },
        afterGeocode: { type: 'string', enum: ['nearbySearch', 'textSearchWithBias'] },
        radiusMeters: { type: 'integer', minimum: 1, maximum: 50000 },
        keyword: { type: 'string', minLength: 1, maxLength: 80 },
        region: { type: 'string', pattern: '^[A-Z]{2}$' },
        language: { type: 'string', enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] },
        reason: { type: 'string', minLength: 1 },
        // NEW: Optional canonical keys (post-processing)
        landmarkId: { type: 'string' },
        cuisineKey: { type: 'string' },
        typeKey: { type: 'string' },
        resolvedLatLng: {
            type: 'object',
            properties: {
                lat: { type: 'number' },
                lng: { type: 'number' }
            },
            required: ['lat', 'lng']
        }
    },
    required: ['providerMethod', 'geocodeQuery', 'afterGeocode', 'radiusMeters', 'keyword', 'region', 'language', 'reason'],
    additionalProperties: false
} as const;

export const LANDMARK_SCHEMA_HASH = createHash('sha256')
    .update(JSON.stringify(LANDMARK_JSON_SCHEMA))
    .digest('hex')
    .substring(0, 12);

/**
 * Assert that a JSON Schema is strict and valid for OpenAI Structured Outputs
 * 
 * Validates that:
 * 1. Schema has 'properties' object
 * 2. Schema has 'required' array
 * 3. EVERY key in 'properties' is included in 'required' (OpenAI strict mode requirement)
 * 
 * @throws Error if schema is invalid
 */
export function assertStrictSchema(schema: any, schemaName: string): void {
  if (!schema || typeof schema !== 'object') {
    throw new Error(`[assertStrictSchema] Schema '${schemaName}' is not an object`);
  }

  if (!schema.properties || typeof schema.properties !== 'object') {
    throw new Error(`[assertStrictSchema] Schema '${schemaName}' is missing 'properties' object`);
  }

  if (!Array.isArray(schema.required)) {
    throw new Error(`[assertStrictSchema] Schema '${schemaName}' is missing 'required' array`);
  }

  const propertyKeys = Object.keys(schema.properties);
  const missingRequired = propertyKeys.filter(key => !schema.required.includes(key));

  if (missingRequired.length > 0) {
    throw new Error(
      `[assertStrictSchema] Schema '${schemaName}' has properties not in required array: ${missingRequired.join(', ')}. ` +
      `OpenAI strict mode requires ALL properties to be in the required array. ` +
      `Properties: [${propertyKeys.join(', ')}], Required: [${schema.required.join(', ')}]`
    );
  }
}
