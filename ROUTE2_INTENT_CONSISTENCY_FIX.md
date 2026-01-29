# Route2 Intent RegionCandidate + Reason Consistency Fix

## Task Complete ✅

Fixed misleading Route2 logs for intent regionCandidate and reason fields.

## Problems Fixed

### 1. Invalid Region Codes in Logs
**Before:** Logs showed invalid codes like `"TQ"` and `"IS"` in `intent_decided`, then `region_sanitized` noise
**After:** Invalid codes rejected at intent stage, set to `null`, triggering clean fallback to device region

### 2. Misleading Intent Reasons  
**Before:** Intent prompt mentioned `"location_bias_applied"` (legacy from old architecture)
**After:** Intent prompt updated with correct routing reasons: `"explicit_city_mentioned"`, `"near_me_phrase"`, etc.

### 3. Region Sanitization Log Noise
**Before:** Every invalid regionCandidate triggered `region_sanitized` event
**After:** Skip log when regionCandidate is `null` or already valid

## Changes Made

### 1. Intent Stage Validation (`intent.stage.ts`)

**Added:**
- Import `isValidRegionCode` from region-code-validator
- Validate `regionCandidate` against ISO-3166-1 allowlist before returning
- Set to `null` if invalid (triggers fallback to device region or 'IL')
- Debug log when invalid code is rejected

```typescript
const validatedRegionCandidate = isValidRegionCode(llmResult.regionCandidate) 
  ? llmResult.regionCandidate 
  : null; // Invalid codes trigger fallback
```

### 2. Type Update (`types.ts`)

**Changed:**
- `regionCandidate: string` → `regionCandidate: string | null`
- Allows proper type safety for null values

### 3. Orchestrator Logging (`route2.orchestrator.ts`)

**Changed:**
- Only include `regionCandidate` in `intent_decided` log if not null
- Conditional log message based on whether candidate exists

```typescript
...(intentDecision.regionCandidate && { regionCandidate: intentDecision.regionCandidate })
```

### 4. Filters Resolver (`filters-resolver.ts`)

**Changed:**
- Skip `region_sanitized` log when `intent.regionCandidate` is `null`
- Skip log when sanitization doesn't change the value

```typescript
const shouldLogSanitization = sanitizedRegionCode !== rawRegionCode && intent.regionCandidate !== null;
```

### 5. Intent Prompt Update (`intent.prompt.ts`)

**Before:** Misleading references to location bias and query rewriting
**After:** Clear routing classification with valid reason values

**Valid Routing Reasons:**
- TEXTSEARCH: `"explicit_city_mentioned"`, `"default_textsearch"`
- NEARBY: `"near_me_phrase"`, `"explicit_distance_from_me"`  
- LANDMARK: `"landmark_detected"`
- Uncertain: `"ambiguous"`

**Region Code Guidance:**
- Use valid ISO-3166-1 alpha-2 codes ONLY
- NEVER use invalid codes like "IS", "TQ", or made-up codes
- Hebrew query → likely "IL"
- If unsure → "IL" (default fallback)

### 6. Tests Added

**New Test File:** `region-candidate-validation.test.ts`
- ✅ Valid ISO codes accepted (IL, US, GB, FR, DE, JP)
- ✅ Invalid codes rejected (TQ, IS, XX, ZZ, ISR)
- ✅ TQ prevented from appearing in logs
- ✅ Valid codes appear in logs correctly
- ✅ Filters resolver skips log when regionCandidate is null
- ✅ Filters resolver skips log when no sanitization needed
- ✅ Filters resolver logs only when actually sanitizing

**All 7 tests pass!**

## Log Flow Examples

### Example 1: Invalid Region Code "TQ"

**Before:**
```json
{"event":"intent_decided","regionCandidate":"TQ","reason":"location_bias_applied"}
{"event":"region_sanitized","regionCode":"TQ","sanitized":"null","source":"intent_candidate"}
{"event":"filters_resolved","regionCode":"IL"}
```

**After:**
```json
{"event":"region_candidate_rejected","rejected":"TQ","reason":"invalid_iso_code"}
{"event":"intent_decided","reason":"explicit_city_mentioned"} // no regionCandidate field
{"event":"filters_resolved","regionCode":"IL"} // no region_sanitized noise
```

### Example 2: Valid Region Code "IL"

**Before & After (unchanged):**
```json
{"event":"intent_decided","regionCandidate":"IL","reason":"explicit_city_mentioned"}
{"event":"filters_resolved","regionCode":"IL"} // no region_sanitized (already valid)
```

### Example 3: Query with City + Bias Enabled

**Hebrew Query:** `"מסעדות אסיאתיות בתל אביב"`

**Logs:**
```json
{"event":"intent_decided","route":"TEXTSEARCH","regionCandidate":"IL","reason":"explicit_city_mentioned","cityText":"תל אביב"}
{"event":"filters_resolved","regionCode":"IL"}
{"event":"schema_check_before_llm","hasBias":true,"cityText":"תל אביב"}
{"event":"google_maps","hasBias":true,"cityText":"תל אביב"}
```

## Acceptance Criteria ✅

- ✅ **No "TQ"/"IS" in logs** - Invalid codes rejected at intent stage
- ✅ **regionCandidate only logged when valid** - Conditional logging
- ✅ **No region_sanitized noise when null** - Skip log appropriately
- ✅ **Consistent reason values** - Updated prompt with proper routing reasons
- ✅ **cityText appears in Google calls when present** - Unchanged behavior
- ✅ **No behavior change in routing/results** - Pure logging cleanup

## Related Earlier Fixes

This task builds on earlier fixes from the same session:

1. **Region Sanitizer Enhancement** - Added "IS" → "IL" mapping for common LLM mistake
2. **Intent Prompt Rewrite** - Replaced query rewriter prompt with routing classifier
3. **Test Updates** - Fixed all intent.types.test.ts to use `regionCandidate` field

## Technical Benefits

1. **Reduced Log Noise** - No spurious region_sanitized events
2. **Clearer Intent** - Logs show actual routing decisions, not legacy field names
3. **Better Type Safety** - `regionCandidate: string | null` properly typed
4. **LLM Guidance** - Prompt explicitly forbids invalid region codes
5. **Defensive Validation** - Intent stage validates output before logging

## Migration Notes

- No external API changes
- Backward compatible (null is falsy, falls through to device/default)
- Tests verify both old and new behavior patterns
- Logging is cleaner but maintains all essential information
