# TextSearch Schema Fix - OpenAI Strict Mode Compliance

## Summary
Fixed `TEXTSEARCH_JSON_SCHEMA` to ensure OpenAI strict mode compliance by:
1. **Dynamic `required` array**: Programmatically generated from `Object.keys(properties)`
2. **Added debug logging**: Final schema check before each OpenAI call
3. **Ensured all fields are required**: Including `textQuery`, `cuisineKey`, etc.

## Changes

### 1. `static-schemas.ts` - Dynamic Required Array

**Before:**
```typescript
export const TEXTSEARCH_JSON_SCHEMA = {
    type: 'object' as const,
    properties: {
        providerMethod: { type: 'string' as const, enum: ['textSearch'] as const },
        textQuery: { type: 'string' as const, minLength: 1 },
        // ... other properties
    },
    required: ['providerMethod', 'textQuery', 'region', 'language', 'reason', 'cuisineKey', 'requiredTerms', 'preferredTerms', 'strictness', 'typeHint'],
    additionalProperties: false
};
```

**After:**
```typescript
const TEXTSEARCH_PROPERTIES = {
    providerMethod: { type: 'string' as const, enum: ['textSearch'] as const },
    textQuery: { type: 'string' as const, minLength: 1 },
    region: { type: 'string' as const, pattern: '^[A-Z]{2}$' },
    language: { type: 'string' as const, enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] as const },
    reason: { type: 'string' as const, minLength: 1 },
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
    // CRITICAL: required = Object.keys(properties) to ensure ALL fields are required
    required: Object.keys(TEXTSEARCH_PROPERTIES) as Array<keyof typeof TEXTSEARCH_PROPERTIES>,
    additionalProperties: false
};
```

**Key Changes:**
- ✅ Extracted properties into `TEXTSEARCH_PROPERTIES` constant
- ✅ `required` array now dynamically generated: `Object.keys(TEXTSEARCH_PROPERTIES)`
- ✅ Ensures EVERY property is automatically included in required array
- ✅ Guarantees `textQuery` is always in required array
- ✅ Maintains `additionalProperties: false`

### 2. `textsearch.mapper.ts` - Debug Logging Before OpenAI Calls

Added comprehensive debug logging **immediately before** each `llmProvider.completeJSON` call:

```typescript
// FINAL SCHEMA CHECK: Log schema state right before OpenAI call
const finalPropertyKeys = Object.keys(TEXTSEARCH_JSON_SCHEMA.properties);
const finalRequiredKeys = Array.from(TEXTSEARCH_JSON_SCHEMA.required);
const missingRequiredKeys = finalPropertyKeys.filter(key => !finalRequiredKeys.includes(key));

logger.info({
  requestId,
  stage: 'textsearch_mapper',
  event: 'schema_final_check',
  schemaType: TEXTSEARCH_JSON_SCHEMA.type,
  propertyKeys: finalPropertyKeys,
  requiredKeys: finalRequiredKeys,
  missingRequiredKeys: missingRequiredKeys.length > 0 ? missingRequiredKeys : undefined,
  hasTextQueryInRequired: finalRequiredKeys.includes('textQuery'),
  additionalProperties: TEXTSEARCH_JSON_SCHEMA.additionalProperties,
  isValid: missingRequiredKeys.length === 0
}, '[TEXTSEARCH] Final schema check before OpenAI call');
```

**Logged Information:**
- `event: 'schema_final_check'` ✅
- `propertyKeys`: All keys in `properties` object
- `requiredKeys`: All keys in `required` array ✅
- `missingRequiredKeys`: Keys in properties but NOT in required ✅
- `hasTextQueryInRequired`: Explicit check for `textQuery`
- `additionalProperties`: Value of `additionalProperties` field
- `isValid`: `true` if no missing required keys

**Added in Two Places:**
1. Before initial OpenAI call (line ~233)
2. Before retry OpenAI call (line ~285)

## Final Schema Structure

The final schema sent to OpenAI now has:

```json
{
  "type": "object",
  "properties": {
    "providerMethod": { "type": "string", "enum": ["textSearch"] },
    "textQuery": { "type": "string", "minLength": 1 },
    "region": { "type": "string", "pattern": "^[A-Z]{2}$" },
    "language": { "type": "string", "enum": ["he", "en", "ru", "ar", "fr", "es", "other"] },
    "reason": { "type": "string", "minLength": 1 },
    "cuisineKey": { "type": ["string", "null"], "enum": [..., null] },
    "requiredTerms": { "type": "array", "items": { "type": "string" } },
    "preferredTerms": { "type": "array", "items": { "type": "string" } },
    "strictness": { "type": "string", "enum": ["STRICT", "RELAX_IF_EMPTY"] },
    "typeHint": { "type": "string", "enum": ["restaurant", "cafe", "bar", "any"] }
  },
  "required": [
    "providerMethod",
    "textQuery",
    "region",
    "language",
    "reason",
    "cuisineKey",
    "requiredTerms",
    "preferredTerms",
    "strictness",
    "typeHint"
  ],
  "additionalProperties": false
}
```

✅ **All requirements met:**
- `type: "object"` ✅
- `properties` includes all 10 fields ✅
- `required` = `Object.keys(properties)` ✅
- `required` includes `textQuery` ✅
- `additionalProperties: false` ✅

## Verification

To verify the fix, check logs for:

```
event: "schema_final_check"
requiredKeys: ["providerMethod", "textQuery", "region", "language", "reason", "cuisineKey", "requiredTerms", "preferredTerms", "strictness", "typeHint"]
missingRequiredKeys: undefined (or omitted if empty)
hasTextQueryInRequired: true
isValid: true
```

## Files Modified

1. `server/src/services/search/route2/stages/route-llm/static-schemas.ts`
   - Refactored `TEXTSEARCH_JSON_SCHEMA` to use dynamic `required` array

2. `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`
   - Added `schema_final_check` debug logs before OpenAI calls (initial + retry)

## Hash Unchanged

Schema hash remains: `textsearch_v4_language_separation`

## Testing

Run existing tests to verify:
```bash
npm test -- textsearch-schema.test.ts
npm test -- schema-fix.test.ts
npm test -- static-schemas.test.ts
```

All tests should pass with the new dynamic `required` array.
