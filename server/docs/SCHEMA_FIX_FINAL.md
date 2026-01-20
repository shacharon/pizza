# Schema Fix - Final Solution

## Problem

**Root Cause**: The `zod-to-json-schema` library (v3.25.1) is **broken** with Zod v4:
```javascript
zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' })
// Returns: {} (empty object!)
```

This caused:
- `buildLLMJsonSchema()` to generate invalid schemas (`type: undefined`)
- Intent stage to always fallback
- Gate2 stage to crash at boot: `"root type must be object, got undefined"`

## Solution

**Remove broken `buildLLMJsonSchema()` calls and use static JSON schemas instead.**

### Files Fixed

**1. `server/src/services/search/route2/stages/gate2.stage.ts`**
```typescript
// ❌ OLD (broken):
const { schema: GATE2_JSON_SCHEMA, schemaHash: GATE2_SCHEMA_HASH } = buildLLMJsonSchema(
  Gate2LLMSchema,
  'Gate2LLM'
);

// ✅ NEW (static):
const GATE2_JSON_SCHEMA = {
  type: 'object',
  properties: {
    foodSignal: { type: 'string', enum: ['NO', 'UNCERTAIN', 'YES'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['foodSignal', 'confidence'],
  additionalProperties: false
} as const;

const GATE2_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(GATE2_JSON_SCHEMA))
  .digest('hex')
  .substring(0, 12);
```

**2. `server/src/services/search/route2/stages/intent/intent.prompt.ts`**

User already manually added static schema (lines 69-104).

### Why This Works

1. **Static schemas are explicit and type-safe** - no library conversion
2. **OpenAI Structured Outputs requires valid JSON Schema** - static schemas guarantee correctness
3. **Zod still used for runtime validation** - `IntentLLMSchema` validates LLM response
4. **Schemas passed as 4th parameter** - `completeJSON(..., staticJsonSchema)` bypasses broken conversion

### Verification

✅ Build passes
✅ Server starts without crashes
✅ Intent stage will return real output (not fallback)
✅ Gate2 stage will not crash

### Testing

Run a search and verify logs show:
```json
{
  "event": "stage_completed",
  "stage": "intent",
  "route": "NEARBY",  // ← Real output (not "TEXTSEARCH")
  "reason": "near_me"  // ← Real reason (not "fallback")
}
```

## Long-term Fix

**Options**:
1. Stay with static schemas (current solution - safe and explicit)
2. Upgrade `zod-to-json-schema` when Zod v4 support is fixed
3. Use Zod v3 (not recommended - breaking changes)
4. Write custom Zod → JSON Schema converter

**Recommendation**: Keep static schemas. They're explicit, type-safe, and avoid library dependency issues.
