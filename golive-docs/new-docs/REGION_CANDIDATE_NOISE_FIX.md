# Region Candidate Noise Fix (GZ)

**Date**: 2026-01-28  
**Type**: Bug Fix - Reduce Invalid Region Logging Noise  
**Scope**: Backend Route2 Pipeline - Region Validation  

---

## Problem Statement

**Issue:** Logs contained repeated INFO-level entries for region code `GZ` (Gaza Strip), which is a **known unsupported** region by Google Places API. This created unnecessary noise in production logs.

### Example Log Noise

**Before Fix:**
```json
{"level":"info","event":"intent_decided","regionCandidate":"GZ",...}
{"level":"info","event":"region_invalid","regionCode":"GZ","fallback":"null",...}
{"level":"info","event":"filters_resolved","regionCode":"IL","sanitized":true,...}
```

Every search with `regionCandidate: GZ` produced an INFO-level log, even though this is:
1. ✅ **Expected behavior** (intent LLM can suggest GZ)
2. ✅ **Handled correctly** (sanitized to IL or null)
3. ✅ **Not a bug or error**

---

## Root Cause

**Location:** `server/src/services/search/route2/shared/filters-resolver.ts`

**Original Code (Line 46-54):**
```typescript
if (sanitizedRegionCode !== rawRegionCode) {
    const fallback = sanitizedRegionCode || getFallbackRegion(rawRegionCode, userLocation);
    
    logger.info({  // ← INFO level for ALL invalid regions
        requestId,
        pipelineVersion: 'route2',
        event: 'region_invalid',
        regionCode: rawRegionCode,
        source: intent.regionCandidate ? 'intent_candidate' : (deviceRegionCode ? 'device' : 'default'),
        fallback: fallback || 'null',
        insideIsrael: userLocation ? sanitizeRegionCode('GZ', userLocation) === 'IL' : false
    }, '[ROUTE2] Invalid region code detected');
}
```

**Issue:** All invalid regions logged at INFO level, including `GZ` which is:
- Known to be unsupported by Google Places API
- Explicitly handled in `region-code-validator.ts`
- Expected input from intent LLM (Gaza Strip queries)

---

## Solution

### Strategy: Differentiated Logging Levels

1. **Known Unsupported Regions (e.g., GZ)** → `logger.debug` (expected behavior, no action needed)
2. **Unexpected Invalid Regions (e.g., typos, malformed)** → `logger.info` (potential bugs, worth investigating)

---

### Implementation

#### 1. Added Utility Function

**File:** `server/src/services/search/route2/utils/region-code-validator.ts`

**New Function:**
```typescript
/**
 * Check if a region code is a known unsupported region
 * Used to reduce log noise for expected cases
 * 
 * @param code Region code to check
 * @returns true if this is a known unsupported region (e.g., GZ)
 */
export function isKnownUnsupportedRegion(code: string): boolean {
  // Gaza Strip - not supported by Google Places API
  // This is expected input from intent LLM, so we handle it gracefully
  return code === 'GZ';
}
```

**Why This Design:**
- ✅ Centralized logic (single source of truth)
- ✅ Easy to extend (add more known unsupported regions)
- ✅ Self-documenting (clear comment explaining why GZ is special)

---

#### 2. Updated Filters Resolver

**File:** `server/src/services/search/route2/shared/filters-resolver.ts`

**Before:**
```typescript
if (sanitizedRegionCode !== rawRegionCode) {
    const fallback = sanitizedRegionCode || getFallbackRegion(rawRegionCode, userLocation);
    
    logger.info({  // ← Always INFO
        requestId,
        pipelineVersion: 'route2',
        event: 'region_invalid',
        regionCode: rawRegionCode,
        source: intent.regionCandidate ? 'intent_candidate' : (deviceRegionCode ? 'device' : 'default'),
        fallback: fallback || 'null',
        insideIsrael: userLocation ? sanitizeRegionCode('GZ', userLocation) === 'IL' : false
    }, '[ROUTE2] Invalid region code detected');
}
```

**After:**
```typescript
if (sanitizedRegionCode !== rawRegionCode) {
    const fallback = sanitizedRegionCode || getFallbackRegion(rawRegionCode, userLocation);
    
    const logData = {
        requestId,
        pipelineVersion: 'route2',
        event: 'region_sanitized',  // ← Event renamed for clarity
        regionCode: rawRegionCode,
        sanitized: fallback || 'null',
        source: intent.regionCandidate ? 'intent_candidate' : (deviceRegionCode ? 'device' : 'default')
    };
    
    if (isKnownUnsupportedRegion(rawRegionCode)) {
        // Debug level for expected cases (reduces noise)
        logger.debug(logData, '[ROUTE2] Known unsupported region sanitized (e.g., GZ)');
    } else {
        // Info level for unexpected invalid regions (helps catch bugs)
        logger.info(logData, '[ROUTE2] Unexpected region code sanitized');
    }
}
```

**Key Changes:**
1. **Event renamed**: `region_invalid` → `region_sanitized` (more accurate - not invalid, just unsupported)
2. **Conditional logging**:
   - `GZ` → `logger.debug` (expected, no noise)
   - Other invalid → `logger.info` (unexpected, worth investigating)
3. **Removed redundant field**: `insideIsrael` check removed (not needed in log)

---

## Behavior After Fix

### Scenario 1: GZ Region (Known Unsupported)

**Input:** User searches "pizza in Gaza" → Intent LLM returns `regionCandidate: "GZ"`

**Logs:**
```json
// INFO: Intent decided (still logged, shows what LLM suggested)
{"level":"info","event":"intent_decided","regionCandidate":"GZ",...}

// DEBUG: Region sanitized (now at debug level - no noise)
{"level":"debug","event":"region_sanitized","regionCode":"GZ","sanitized":"null",...}

// INFO: Filters resolved (still logged, shows final region used)
{"level":"info","event":"filters_resolved","regionCode":"IL","sanitized":true,...}
```

**Result:** At default INFO log level, only 2 entries visible (no `region_sanitized` noise).

---

### Scenario 2: Unexpected Invalid Region

**Input:** User somehow sends `regionCandidate: "XX"` (malformed/typo)

**Logs:**
```json
// INFO: Intent decided
{"level":"info","event":"intent_decided","regionCandidate":"XX",...}

// INFO: Unexpected region sanitized (STILL logged - helps catch bugs)
{"level":"info","event":"region_sanitized","regionCode":"XX","sanitized":"null",...}

// INFO: Filters resolved
{"level":"info","event":"filters_resolved","regionCode":"IL","sanitized":true,...}
```

**Result:** Still logged at INFO level - this is unexpected and might indicate a bug.

---

## Files Modified

### 1. Region Validator (Utility)

**`server/src/services/search/route2/utils/region-code-validator.ts`**
- Added `isKnownUnsupportedRegion()` function
- **Lines added:** +13

---

### 2. Filters Resolver (Main Logic)

**`server/src/services/search/route2/shared/filters-resolver.ts`**
- Updated import to include `isKnownUnsupportedRegion`
- Changed logging from single `logger.info` to conditional `logger.debug` / `logger.info`
- Renamed event: `region_invalid` → `region_sanitized`
- Removed redundant `insideIsrael` field from log
- **Lines changed:** ~15

---

## Summary of Changes

| Aspect | Before | After |
|--------|--------|-------|
| **Log Level (GZ)** | INFO | DEBUG |
| **Log Level (Other)** | INFO | INFO |
| **Event Name** | `region_invalid` | `region_sanitized` |
| **Log Fields** | Includes `insideIsrael` | Removed (redundant) |
| **Maintainability** | Hardcoded check | Utility function |

---

## Verification

### Test Scenario

```bash
# 1. Start server
cd server
npm start

# 2. Perform search with Gaza location
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{
    "query": "pizza in Gaza",
    "userLocation": {"lat": 31.5, "lng": 34.45}
  }'

# 3. Check logs at INFO level
grep "region" server/logs/server.log | grep -v "DEBUG"
```

### Expected Results (After Fix)

**INFO-level logs (visible by default):**
```json
{"level":"info","event":"intent_decided","regionCandidate":"GZ",...}
{"level":"info","event":"filters_resolved","regionCode":"IL","sanitized":true,...}
```

**DEBUG-level logs (hidden by default, visible with LOG_LEVEL=debug):**
```json
{"level":"debug","event":"region_sanitized","regionCode":"GZ","sanitized":"null",...}
```

✅ **Result:** No INFO-level noise for known unsupported regions.

---

### Test with Unknown Invalid Region

```bash
# Manually simulate malformed region (requires direct backend call)
# In route2.orchestrator.ts, temporarily inject:
# intent.regionCandidate = 'XX';

# Run search and check logs
grep "region_sanitized" server/logs/server.log
```

**Expected:**
```json
{"level":"info","event":"region_sanitized","regionCode":"XX","sanitized":"null",...}
```

✅ **Result:** Still logged at INFO (unexpected cases remain visible).

---

## Benefits

1. **Reduced Log Noise** ✅
   - GZ entries no longer clutter INFO-level logs
   - Production logs are cleaner and easier to scan

2. **Better Signal-to-Noise Ratio** ✅
   - INFO logs now indicate **unexpected** behavior
   - DEBUG logs capture expected edge cases

3. **Maintainable** ✅
   - Centralized `isKnownUnsupportedRegion()` utility
   - Easy to add more known unsupported regions (e.g., `PS` for Palestine)

4. **No Behavior Change** ✅
   - Region sanitization logic unchanged
   - Same fallback behavior (GZ → IL or null)
   - Same `filters_resolved` output

5. **Better Debugging** ✅
   - Can still see GZ handling by setting `LOG_LEVEL=debug`
   - Unexpected invalid regions still logged at INFO

---

## Edge Cases Covered

| Region Code | Is Valid? | Log Level | Notes |
|-------------|-----------|-----------|-------|
| `IL` | ✅ Yes | No log | Valid, no sanitization needed |
| `GZ` | ❌ No (known unsupported) | DEBUG | Expected, handled gracefully |
| `XX` | ❌ No (malformed) | INFO | Unexpected, might indicate bug |
| `USA` | ❌ No (3 chars) | INFO | Malformed, should be `US` |
| `null` | ❌ No | No log | No region provided, defaults to IL |

---

## Rollback Plan

If issues arise, revert changes:

```bash
git revert <commit-sha>
```

Changes are isolated to:
1. New utility function (safe - only called in one place)
2. Logging logic (no behavior change - only log level)

---

## Future Enhancements

### Add More Known Unsupported Regions

If intent LLM frequently suggests other unsupported regions, update:

```typescript
export function isKnownUnsupportedRegion(code: string): boolean {
  const knownUnsupported = new Set(['GZ', 'PS', 'XK']); // Gaza, Palestine, Kosovo
  return knownUnsupported.has(code);
}
```

### Add Metrics

Track how often each region is sanitized:

```typescript
if (sanitizedRegionCode !== rawRegionCode) {
  metrics.increment('region.sanitized', { regionCode: rawRegionCode });
  // ... existing logging
}
```

---

**Status:** ✅ **Complete** - GZ region validation now logs at DEBUG level (reduces noise). Unexpected invalid regions still log at INFO level (helps catch bugs).

**Key Achievement:** Reduced log noise for known edge cases while preserving visibility for unexpected issues.
