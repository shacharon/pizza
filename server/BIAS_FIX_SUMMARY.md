# ✅ Bias Field Fix Complete

## Problem

After changing `bias` from `.nullable()` to `.optional()` in the Zod schema:
```typescript
// Before
bias: LocationBiasSchema.nullable()

// After  
bias: LocationBiasSchema.optional()
```

All assignments of `bias: null` became type errors:
```
Type 'null' is not assignable to type '{ type: "locationBias"; ... } | undefined'.
```

## Solution

Changed all `bias: null` assignments to `bias: undefined`:

### Files Changed

1. **textsearch.mapper.ts** (3 locations)
   - Line 82: `mapping.bias = undefined` (manual injection)
   - Line 127: `bias: undefined` (deterministic fallback)
   - Line 146: `bias: undefined` (applyLocationBias return)

2. **google-maps.stage.ts** (3 locations)
   - Line 212: `hasBias: !!mapping.bias` (null check → truthy check)
   - Line 233: `if (results.length <= 1 && mapping.bias)` (null check → truthy check)
   - Line 249: `bias: undefined` (retry mapping)

## Why `.optional()` Instead of `.nullable()`?

- `.nullable()` → field can be `T | null` (must be present)
- `.optional()` → field can be `T | undefined` (can be omitted)

Since the LLM schema doesn't include `bias` at all (removed to avoid oneOf), the LLM returns **no bias field**, which means `undefined` in JavaScript, not `null`.

Using `.optional()` matches the actual LLM behavior.

## Build Status

✅ **TypeScript compilation passes**
✅ **All null checks updated to work with undefined**
