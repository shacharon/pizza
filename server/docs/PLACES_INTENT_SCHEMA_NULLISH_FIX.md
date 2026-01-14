# PlacesIntentSchema Nullish Fix

## Problem
After fixing the `PromptSchema` (used by OpenAI) to accept `null` values with `.nullable()`, we were still getting `ZodError` validation failures:

```
"expected": "string", "code": "invalid_type", "path": ["search", "target", "city"], "message": "Invalid input: expected string, received null"
"expected": "object", "code": "invalid_type", "path": ["output"], "message": "Invalid input: expected object, received null"
"code": "invalid_value", "values": [true], "path": ["search", "filters", "opennow"], "message": "Invalid input: expected true"
```

## Root Cause
The codebase uses **two separate Zod schemas** for Places Intent:

1. **`PromptSchema`** (`places-intent.service.ts` line 7)
   - Used by `llm.completeJSON()` to define OpenAI's output format
   - Was fixed with `.nullable()` in previous commit

2. **`PlacesIntentSchema`** (`places-intent.schema.ts` line 41)
   - Used on line 416 of `places-intent.service.ts` for **post-validation**: `PlacesIntentSchema.parse(raw)`
   - Still had `.optional()` (expects `undefined`, rejects `null`)
   - Had `opennow: z.literal(true).optional()` which **only** accepted the value `true`, rejecting `null`

## Flow
1. OpenAI returns JSON with `null` values (e.g., `city: null`, `opennow: null`)
2. `llm.completeJSON()` validates with `PromptSchema` → ✅ passes (has `.nullable()`)
3. Line 416 validates with `PlacesIntentSchema` → ❌ fails (has `.optional()` expecting `undefined`, not `null`)

## Solution
Updated `PlacesIntentSchema` in `places-intent.schema.ts` to use **`.nullish()`** instead of `.optional()`:

- `.optional()` = accepts `undefined` only (field can be missing)
- `.nullable()` = accepts `null` only (field present but null)
- **`.nullish()`** = accepts **both** `null` and `undefined` ✅

### Changes Made

#### 1. `TargetSchema` (line 9)
```typescript
// Before
city: z.string().min(1).max(120).optional(),
place: z.string().min(1).max(200).optional(),
coords: CoordsSchema.optional(),

// After
city: z.string().min(1).max(120).nullish(),
place: z.string().min(1).max(200).nullish(),
coords: CoordsSchema.nullish(),
```

#### 2. `FiltersSchema` (line 16)
```typescript
// Before
type: z.string().optional(),
keyword: z.string().optional(),
price: z.object({ ... }).optional(),
opennow: z.literal(true).optional(),  // ← PROBLEM: only accepts true
radius: z.number().min(1).max(30000).optional(),
rankby: z.enum(['prominence', 'distance']).optional(),
language: z.enum(['he', 'en']).optional(),
region: z.string().optional(),

// After
type: z.string().nullish(),
keyword: z.string().nullish(),
price: z.object({ ... }).nullish(),
opennow: z.boolean().nullish(),  // ← FIX: accepts true/false/null/undefined
radius: z.number().min(1).max(30000).nullish(),
rankby: z.enum(['prominence', 'distance']).nullish(),
language: z.enum(['he', 'en']).nullish(),
region: z.string().nullish(),
```

#### 3. `OutputSchema` (line 27)
```typescript
// Before
fields: z.array(z.string()).default([...]),
page_size: z.number().int().min(1).max(50).default(10),
}).nullable();

// After
fields: z.array(z.string()).nullish(),
page_size: z.number().int().min(1).max(50).nullish(),
}).nullish();
```

#### 4. `SearchSchema` (line 34)
```typescript
// Before
query: z.string().optional(),

// After
query: z.string().nullish(),
```

### Downstream Fixes
Updated call sites where `null` values were being passed to functions that don't accept `null`:

1. **`places-intent.service.ts:461`**
   ```typescript
   // Before: intent.search.query (string | null | undefined)
   // After:  intent.search.query ?? undefined (string | undefined)
   const cleanedQuery = this.stripLocationFromQuery(intent.search.query ?? undefined, tokens);
   ```

2. **`query-builder.service.ts:14,20,39,45`**
   ```typescript
   // Before: filters.language (string | null | undefined)
   // After:  filters.language ?? undefined (string | undefined)
   coords = await client.geocodeAddress(city, filters.language ?? undefined, ...);
   ```

3. **`intent.service.ts:355`**
   ```typescript
   // Before: filters.opennow !== undefined (includes null)
   // After:  filters.opennow === true (strict boolean check)
   filters: {
     ...(filters.opennow === true && { openNow: true }),
   },
   ```

## Testing
1. Run `npm run build` → ✅ Success (0 errors)
2. Restart server with new build
3. Test query: "Trouve-moi un restaurant sur les Champs-Élysées" (French)
4. Expected:
   - OpenAI returns JSON with `null` fields
   - `PromptSchema` validation passes (accepts `null`)
   - `PlacesIntentSchema` validation passes (accepts `null` via `.nullish()`)
   - No `ZodError`
   - Search completes successfully

## Files Modified
- `server/src/services/places/intent/places-intent.schema.ts` - Updated all schemas to use `.nullish()`
- `server/src/services/places/intent/places-intent.service.ts` - Added `?? undefined` for query
- `server/src/services/places/query/query-builder.service.ts` - Added `?? undefined` for language
- `server/src/services/search/capabilities/intent.service.ts` - Strict boolean check for `opennow`

## Related Docs
- `PLACES_INTENT_STATIC_SCHEMA_FIX.md` - Previous fix for OpenAI schema validation
- `STATIC_SCHEMA_FIX.md` - Static JSON Schema for Intent Gate
- `SCHEMA_FIX_400_ERROR.md` - Original schema validation issue

## Additional Fix: Language and Region Fields

After the initial fix, a new error appeared:
```
"Invalid option: expected one of \"he\"|\"en\"" for filters.language
"expected string, received undefined" for filters.region
```

### Root Cause
The `PromptSchema` (used by OpenAI) had a comment:
```typescript
// NOTE: language and region removed - will be set by orchestrator based on LanguageContext
```

So OpenAI was NOT returning these fields at all. But `PlacesIntentSchema` still expected them with `.nullish()`.

### Solution
Changed `language` and `region` to use **`.optional()`** instead of `.nullish()`:

```typescript
// Fields that OpenAI DOES return but might be null → .nullish()
type: z.string().nullish(),
keyword: z.string().nullish(),
opennow: z.boolean().nullish(),

// Fields that OpenAI DOESN'T return (completely missing) → .optional()
language: z.enum(['he', 'en']).optional(),  // Injected by orchestrator
region: z.string().optional(),  // Injected by orchestrator
```

**Key Distinction:**
- `.nullish()` = accepts `null`, `undefined`, or missing ✅ for fields OpenAI returns
- `.optional()` = accepts `undefined` or missing (NOT `null`) ✅ for fields OpenAI doesn't return

## Date
2026-01-14 01:25 UTC (Initial fix)
2026-01-14 01:33 UTC (Language/region fix)
