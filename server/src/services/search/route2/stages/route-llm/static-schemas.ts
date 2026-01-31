/**
 * Static JSON Schemas for Route-LLM Mappers
 * Manual definitions because zod-to-json-schema is broken with Zod v4
 */

import { createHash } from 'crypto';

// TextSearch JSON Schema - V5: KEYED vs FREE_TEXT Mode
// MODE-BASED APPROACH:
// - KEYED mode: LLM outputs cuisineKey/placeTypeKey/cityText → mapper builds deterministic query
// - FREE_TEXT mode: LLM signals no keys → mapper uses clean original query
// 
// CRITICAL: OpenAI strict mode requirements:
// - ALL properties MUST be in the required array (including nullable ones)
// - Use type: ['string', 'null'] instead of nullable: true for nullable fields
// - Do NOT use 'default' keyword (defaults handled in Zod, not JSON schema)
// - additionalProperties: false is required
const TEXTSEARCH_PROPERTIES = {
    providerMethod: { type: 'string' as const, enum: ['textSearch'] as const },
    // NEW: mode field determines query construction strategy
    mode: {
        type: 'string' as const,
        enum: ['KEYED', 'FREE_TEXT'] as const
    },
    // REMOVED from required: textQuery (generated deterministically in mapper)
    region: { type: 'string' as const, pattern: '^[A-Z]{2}$' },
    language: { type: 'string' as const, enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] as const },
    reason: { type: 'string' as const, minLength: 1 },
    // NEW: Canonical cuisine key (language-independent) - nullable
    cuisineKey: {
        type: ['string', 'null'] as const,
        enum: [
            'italian', 'asian', 'japanese', 'chinese', 'thai', 'indian',
            'mediterranean', 'middle_eastern', 'american', 'mexican', 'french',
            'seafood', 'steakhouse', 'pizza', 'sushi', 'burger',
            'vegan', 'vegetarian', 'kosher', 'dairy', 'meat', 'fish',
            'breakfast', 'cafe', 'bakery', 'dessert',
            'fast_food', 'fine_dining', 'casual_dining',
            null
        ] as const
    },
    // NEW: Place type key (for future expansion) - nullable
    placeTypeKey: {
        type: ['string', 'null'] as const
    },
    // NEW: cityText (required if intent reason is explicit_city_mentioned) - nullable
    cityText: {
        type: ['string', 'null'] as const
    },
    // Arrays with defaults - still in required array per OpenAI strict mode
    requiredTerms: {
        type: 'array' as const,
        items: { type: 'string' as const }
    },
    preferredTerms: {
        type: 'array' as const,
        items: { type: 'string' as const }
    },
    strictness: {
        type: 'string' as const,
        enum: ['STRICT', 'RELAX_IF_EMPTY'] as const
    },
    typeHint: {
        type: 'string' as const,
        enum: ['restaurant', 'cafe', 'bar', 'any'] as const
    }
} as const;

export const TEXTSEARCH_JSON_SCHEMA = {
    type: 'object' as const,
    properties: TEXTSEARCH_PROPERTIES,
    // ALL properties must be in required array per OpenAI strict mode
    // CRITICAL: required = Object.keys(properties) to ensure ALL fields are required
    // This guarantees textQuery and all other fields are in the required array
    required: Object.keys(TEXTSEARCH_PROPERTIES) as Array<keyof typeof TEXTSEARCH_PROPERTIES>,
    additionalProperties: false
};

export const TEXTSEARCH_SCHEMA_HASH = 'textsearch_v5_keyed_freetext_mode';

// Nearby JSON Schema
// OpenAI strict mode: ALL properties in required array (including nullable)
// NOTE: Removed 'as const' on root to allow schema-converter modifications
export const NEARBY_JSON_SCHEMA = {
    type: 'object' as const,
    properties: {
        providerMethod: { type: 'string' as const, enum: ['nearbySearch'] as const },
        location: {
            type: 'object' as const,
            properties: {
                lat: { type: 'number' as const, minimum: -90, maximum: 90 },
                lng: { type: 'number' as const, minimum: -180, maximum: 180 }
            },
            required: ['lat', 'lng'],
            additionalProperties: false
        },
        radiusMeters: { type: 'integer' as const, minimum: 1, maximum: 50000 },
        keyword: { type: 'string' as const, minLength: 1, maxLength: 80 },
        region: { type: 'string' as const, pattern: '^[A-Z]{2}$' },
        language: { type: 'string' as const, enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] as const },
        reason: { type: 'string' as const, minLength: 1 },
        // NEW: Optional canonical keys (nullable but in required array per OpenAI strict mode)
        cuisineKey: { type: ['string', 'null'] as const },
        typeKey: { type: ['string', 'null'] as const }
    },
    // ALL properties in required array per OpenAI strict mode
    // NOTE: Using regular array (not 'as const') to ensure proper serialization to OpenAI
    required: ['providerMethod', 'location', 'radiusMeters', 'keyword', 'region', 'language', 'reason', 'cuisineKey', 'typeKey'],
    additionalProperties: false
};

export const NEARBY_SCHEMA_HASH = createHash('sha256')
    .update(JSON.stringify(NEARBY_JSON_SCHEMA))
    .digest('hex')
    .substring(0, 12);

// Landmark JSON Schema
// OpenAI strict mode: ALL properties in required array (including nullable)
// NOTE: Removed 'as const' on root to allow schema-converter modifications
export const LANDMARK_JSON_SCHEMA = {
    type: 'object' as const,
    properties: {
        providerMethod: { type: 'string' as const, enum: ['landmarkPlan'] as const },
        geocodeQuery: { type: 'string' as const, minLength: 1, maxLength: 120 },
        afterGeocode: { type: 'string' as const, enum: ['nearbySearch', 'textSearchWithBias'] as const },
        radiusMeters: { type: 'integer' as const, minimum: 1, maximum: 50000 },
        keyword: { type: 'string' as const, minLength: 1, maxLength: 80 },
        region: { type: 'string' as const, pattern: '^[A-Z]{2}$' },
        language: { type: 'string' as const, enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] as const },
        reason: { type: 'string' as const, minLength: 1 },
        // NEW: Optional canonical keys (nullable but in required array per OpenAI strict mode)
        landmarkId: { type: ['string', 'null'] as const },
        cuisineKey: { type: ['string', 'null'] as const },
        typeKey: { type: ['string', 'null'] as const },
        resolvedLatLng: {
            type: ['object', 'null'] as const,
            properties: {
                lat: { type: 'number' as const },
                lng: { type: 'number' as const }
            },
            required: ['lat', 'lng']
        }
    },
    // ALL properties in required array per OpenAI strict mode
    // NOTE: Using regular array (not 'as const') to ensure proper serialization to OpenAI
    required: ['providerMethod', 'geocodeQuery', 'afterGeocode', 'radiusMeters', 'keyword', 'region', 'language', 'reason', 'landmarkId', 'cuisineKey', 'typeKey', 'resolvedLatLng'],
    additionalProperties: false
};

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
