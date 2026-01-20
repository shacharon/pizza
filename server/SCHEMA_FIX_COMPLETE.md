# ✅ Schema Fix Complete

## Problem Solved

**`zod-to-json-schema` library is broken with Zod v4** - returns `{}` for all schemas.

## All Files Fixed

### ✅ 1. Gate2 Stage
**File**: `server/src/services/search/route2/stages/gate2.stage.ts`
- Removed: `buildLLMJsonSchema(Gate2LLMSchema, 'Gate2LLM')`
- Added: Static `GATE2_JSON_SCHEMA` object

### ✅ 2. Intent Stage  
**File**: `server/src/services/search/route2/stages/intent/intent.prompt.ts`
- User already added static `INTENT_JSON_SCHEMA` (lines 69-104)

### ✅ 3. Route-LLM Mappers
**New File**: `server/src/services/search/route2/stages/route-llm/static-schemas.ts`
- Added: `TEXTSEARCH_JSON_SCHEMA` + hash
- Added: `NEARBY_JSON_SCHEMA` + hash
- Added: `LANDMARK_JSON_SCHEMA` + hash

**Updated Files**:
- `textsearch.mapper.ts` - Import static schema
- `nearby.mapper.ts` - Import static schema
- `landmark.mapper.ts` - Import static schema

### ✅ 4. Base Filters
**File**: `server/src/services/search/route2/shared/base-filters-llm.ts`
- Already had static `BASE_FILTERS_JSON_SCHEMA_MANUAL`
- Removed: Unused `buildLLMJsonSchema` import

## Build Status

✅ **BUILD PASSES**
✅ **SERVER STARTS**
✅ **All schemas valid**

## What's Next

Run the server and test:
```bash
npm run dev
```

Expected behavior:
1. ✅ Server starts without crashes
2. ✅ Intent stage returns real LLM output (not fallback)
3. ✅ Logs show `queryHash` instead of raw queries
4. ✅ All pipeline stages complete successfully

## Long-term Note

**Do NOT use `buildLLMJsonSchema()` or `zodToJsonSchema()`** with Zod v4.
Always use static JSON schemas until library support improves.

The Zod schemas are still used for runtime validation via `.parse()` - we just don't use them for JSON Schema generation.
