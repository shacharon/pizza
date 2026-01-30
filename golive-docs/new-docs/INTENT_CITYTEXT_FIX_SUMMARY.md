# Route2 INTENT cityText Parse Error Fix

## ✅ Issue Resolved

Fixed ZodError where INTENT stage was failing to parse `cityText: null` from LLM responses.

## 🐛 Root Cause

**Symptom**: Cloud logs showed ZodError with path `["cityText"]`, expected string, received null. This caused intent stage to fall back (confidence 0.3, reason "fallback").

**Root Cause**: Schema mismatch between JSON schema and Zod schema:

**JSON Schema** (in `intent.prompt.ts`):
```typescript
cityText: { type: ["string", "null"], minLength: 1 }
required: [..., "cityText"] // ✅ Required field, can be null
```

**Zod Schema** (in `intent.types.ts` - BEFORE fix):
```typescript
cityText: z.string().min(1).optional() // ❌ Allows undefined, NOT null
```

When OpenAI returned `cityText: null` (valid per JSON schema), Zod rejected it because `optional()` only allows `undefined`, not `null`.

## 🔧 Solution (SOLID/KISS)

### 1. Updated Zod Schema

**File**: `server/src/services/search/route2/stages/intent/intent.types.ts`

```typescript
// BEFORE
cityText: z.string().min(1).optional()

// AFTER
cityText: z.string().min(1).nullable().optional()
```

Now accepts: `string`, `null`, or `undefined`.

### 2. Added Null Normalization

**File**: `server/src/services/search/route2/stages/intent/intent.stage.ts`

```typescript
// Normalize null to undefined for cityText
const cityText = llmResult.cityText ?? undefined;

return {
  route: llmResult.route,
  confidence: llmResult.confidence,
  reason: llmResult.reason,
  language: llmResult.language,
  region: llmResult.region,
  regionConfidence: llmResult.regionConfidence,
  regionReason: llmResult.regionReason,
  ...(cityText && { cityText }) // Only include if truthy
};
```

Applied normalization in 2 places:
- Main success path (line ~159)
- NEARBY fallback path (line ~127)

### 3. Added Unit Tests

**File**: `server/src/services/search/route2/stages/intent/intent.types.test.ts`

Created comprehensive test suite with **11 tests**, all passing ✅:

- ✅ Parse with `cityText` as string
- ✅ Parse with `cityText` as null (KEY TEST)
- ✅ Parse without `cityText` (undefined)
- ✅ Reject empty string for `cityText`
- ✅ Reject missing required fields
- ✅ Reject invalid route/region/confidence
- ✅ Reject extra fields (strict mode)
- ✅ Handle all valid languages
- ✅ Handle all valid routes

### 4. Verified Compilation

```bash
cd server && npx tsc --noEmit --skipLibCheck
✅ Exit code: 0 (no errors)
```

## 📊 Changes Summary

### Files Modified (3)

1. **`intent.types.ts`** - Made `cityText` nullable
   - Change: Added `.nullable()` to Zod schema
   - Lines changed: 1

2. **`intent.stage.ts`** - Added null normalization
   - Change: Normalize `cityText` null → undefined
   - Lines changed: 4 (2 locations)

3. **`intent.types.test.ts`** - Added comprehensive tests
   - New file: 11 unit tests
   - Lines added: ~180

### No Routing Logic Changed

- ✅ Only schema + normalization + tests
- ✅ Kept schema strict everywhere else
- ✅ No changes to route decision logic
- ✅ No changes to confidence scoring
- ✅ No changes to prompt content

## 🧪 Test Results

### Intent Types Tests
```bash
node --test --import tsx src/services/search/route2/stages/intent/intent.types.test.ts
✅ 11/11 tests passing
✅ Key test: "should parse valid intent response with cityText null"
```

### TypeScript Compilation
```bash
npx tsc --noEmit --skipLibCheck
✅ Exit code: 0 (no errors)
```

## 🎯 Expected Impact

### Before Fix
```
Query: "pizza in geddra"
→ LLM returns: { ..., cityText: null }
→ Zod rejects: ZodError "expected string, received null"
→ Fallback: confidence 0.3, reason "fallback"
→ Search continues with degraded intent
```

### After Fix
```
Query: "pizza in geddra"  
→ LLM returns: { ..., cityText: null }
→ Zod accepts: null is valid ✅
→ Normalized: cityText → undefined
→ IntentResult: { ..., cityText: undefined }
→ Search continues with correct intent (no fallback)
```

## 📋 Verification Steps

To verify the fix in production:

1. **Check logs for parse errors**:
   ```bash
   grep "intent_schema_invalid" server.log
   # Should see reduced occurrences
   ```

2. **Test with query**: `"pizza in geddra"`
   ```bash
   curl -X POST http://localhost:3000/api/v1/search \
     -H "Content-Type: application/json" \
     -d '{"query": "pizza in geddra", "sessionId": "test"}'
   ```

3. **Verify intent logs**:
   ```bash
   grep "intent_decided" server.log
   # Should show confidence > 0.3 (not fallback)
   # Should show reason != "fallback"
   ```

## 🔒 Constraints Met

- ✅ **SOLID/KISS** - Minimal, targeted fix
- ✅ **No routing changes** - Only schema + normalization
- ✅ **Schema strict** - Kept strict mode, only made cityText nullable
- ✅ **Tested** - Comprehensive unit tests
- ✅ **Verified** - TypeScript compilation passes

## ✨ Summary

The INTENT stage parse error is **fixed**. The schema now correctly accepts `cityText: null` from the LLM, and the stage normalizes it to `undefined` for downstream consumption. All tests pass, TypeScript compiles, and no routing logic was changed.

**Status: ✅ Ready for deployment**
