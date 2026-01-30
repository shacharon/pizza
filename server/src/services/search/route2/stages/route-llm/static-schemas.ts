/**
 * Static JSON Schemas for Route-LLM Mappers
 * Manual definitions because zod-to-json-schema is broken with Zod v4
 */

import { createHash } from 'crypto';

// TextSearch JSON Schema
// Flattened bias fields to avoid oneOf/anyOf (OpenAI strict mode compatibility)
// Fixed schema: Removed 'bias' to avoid OpenAI's union type restrictions (oneOf/anyOf)
// INCLUDES cuisine enforcement fields for explicit cuisine queries
export const TEXTSEARCH_JSON_SCHEMA = {
    type: 'object',
    properties: {
        providerMethod: { type: 'string', enum: ['textSearch'] },
        textQuery: { type: 'string', minLength: 1 },
        region: { type: 'string', pattern: '^[A-Z]{2}$' },
        language: { type: 'string', enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] },
        reason: { type: 'string', minLength: 1 },
        // Cuisine enforcement fields (optional with defaults)
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
    required: ['providerMethod', 'textQuery', 'region', 'language', 'reason', 'requiredTerms', 'preferredTerms', 'strictness', 'typeHint'],
    additionalProperties: false
} as const;

export const TEXTSEARCH_SCHEMA_HASH = 'textsearch_v3_cuisine_enforcement';

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
        reason: { type: 'string', minLength: 1 }
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
        reason: { type: 'string', minLength: 1 }
    },
    required: ['providerMethod', 'geocodeQuery', 'afterGeocode', 'radiusMeters', 'keyword', 'region', 'language', 'reason'],
    additionalProperties: false
} as const;

export const LANDMARK_SCHEMA_HASH = createHash('sha256')
    .update(JSON.stringify(LANDMARK_JSON_SCHEMA))
    .digest('hex')
    .substring(0, 12);
