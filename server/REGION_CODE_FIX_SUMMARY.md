# ✅ Region Code Validation Fix - Summary

## Problem
Google Places API returned `INVALID_ARGUMENT` error when `regionCode='GZ'` (Gaza Strip) was sent.

**Root Cause**: 'GZ' is not a valid CLDR country code accepted by Google.

---

## Solution
Implemented **CLDR-compliant region code validation** with special handling for 'GZ'.

**Key Changes**:
1. Validate region codes against CLDR allowlist (60+ codes)
2. Special case: 'GZ' → 'IL' if user inside Israel, else null
3. Invalid codes → null (with 'IL' fallback)
4. Transparent logging

---

## Files Changed

| File | Changes |
|------|---------|
| `utils/region-code-validator.ts` | **NEW** - Validator + CLDR allowlist |
| `shared/filters-resolver.ts` | **MODIFIED** - Integrate sanitizeRegionCode |
| `route2.orchestrator.ts` | **MODIFIED** - Pass userLocation to resolveFilters |
| `stages/google-maps.stage.ts` | **MODIFIED** - Enhanced logging |
| `test-region-code-validator.js` | **NEW** - 12 verification tests |

---

## Core Functions

### 1. `isValidRegionCode(code)`
Validates against CLDR allowlist.

```typescript
isValidRegionCode('IL')  // → true ✅
isValidRegionCode('US')  // → true ✅
isValidRegionCode('GZ')  // → false ❌
isValidRegionCode('XX')  // → false ❌
```

---

### 2. `sanitizeRegionCode(code, userLocation)`
Sanitizes and handles special cases.

| Input | Location | Output | Reason |
|-------|----------|--------|--------|
| `'IL'` | - | `'IL'` | Valid code |
| `'GZ'` | Tel Aviv | `'IL'` | Inside Israel |
| `'GZ'` | London | `null` | Outside Israel |
| `'GZ'` | None | `null` | No location |
| `'XX'` | - | `null` | Invalid code |

---

### 3. `isInsideIsrael(lat, lng)`
Checks if coordinates are in Israel bbox.

```typescript
isInsideIsrael(32.0853, 34.7818)  // Tel Aviv → true ✅
isInsideIsrael(31.5, 34.45)       // Gaza → true ✅
isInsideIsrael(51.5074, -0.1278)  // London → false ❌
```

---

## Behavior Examples

### Example 1: 'GZ' with Tel Aviv location

**Input**:
```
regionCode: 'GZ'
userLocation: { lat: 32.08, lng: 34.78 }
```

**Process**:
1. Sanitize: `isInsideIsrael(32.08, 34.78)` → true
2. Result: `'GZ'` → `'IL'`

**Log**:
```json
{
  "event": "region_invalid",
  "regionCode": "GZ",
  "fallback": "IL",
  "insideIsrael": true
}
```

**Google receives**: `regionCode: 'IL'` ✅

---

### Example 2: Invalid code 'XX'

**Input**:
```
regionCode: 'XX'
```

**Process**:
1. Validate: `isValidRegionCode('XX')` → false
2. Sanitize: `'XX'` → null
3. Fallback: `'IL'`

**Log**:
```json
{
  "event": "region_invalid",
  "regionCode": "XX",
  "fallback": "null"
}
```

**Google receives**: `regionCode: 'IL'` ✅

---

### Example 3: Valid code 'US'

**Input**:
```
regionCode: 'US'
```

**Process**:
1. Validate: `isValidRegionCode('US')` → true
2. Pass through: `'US'`

**Log**: No `region_invalid` event

**Google receives**: `regionCode: 'US'` ✅

---

## Testing Results

### Manual Tests: ✅ 12/12 PASSED

```bash
node test-region-code-validator.js
```

**Tests**:
```
✅ Valid CLDR codes accepted
✅ Invalid codes rejected
✅ isInsideIsrael check
✅ Valid codes pass through
✅ Invalid codes → null
✅ GZ + Israel location → IL
✅ GZ + outside location → null
✅ GZ without location → null
✅ getFallbackRegion inside Israel
✅ getFallbackRegion outside Israel
✅ Real Gaza coordinates
✅ Null/undefined handling

Passed: 12/12
```

---

## Logging

### New Event: `region_invalid`

```json
{
  "event": "region_invalid",
  "regionCode": "GZ",
  "source": "intent",
  "fallback": "IL",
  "insideIsrael": true
}
```

**Triggered**: When invalid/GZ code detected

**Fields**:
- `regionCode`: Original code
- `source`: 'intent' / 'device' / 'default'
- `fallback`: What was used instead
- `insideIsrael`: User in Israel bbox

---

### Updated Event: `filters_resolved`

```json
{
  "event": "filters_resolved",
  "final": {
    "regionCode": "IL"
  },
  "sanitized": true
}
```

**New field**: `sanitized` (true if code was changed)

---

## CLDR Codes Supported

**Total**: 60+ codes

**Regions**:
- Americas: US, CA, MX, BR, AR, CL, CO, PE
- Europe: GB, FR, DE, ES, IT, NL, BE, CH, etc.
- Middle East: IL, TR, SA, AE, EG, JO, LB, SY, IQ
- Asia: IN, CN, JP, KR, TH, VN, MY, SG, ID, PH
- Africa: ZA, KE, NG, MA, DZ, TN, LY

**Not Supported**:
- GZ (Gaza) - special handling
- XX, ABC, etc. - invalid

---

## Impact

### Benefits
✅ Fixes `INVALID_ARGUMENT` API errors  
✅ Handles 'GZ' gracefully  
✅ Transparent logging  
✅ Backward compatible  
✅ Safe fallbacks  

### Risks
⚠️ Geographic approximation for 'GZ'  
⚠️ CLDR list requires manual updates  

---

## Verification Command

```bash
cd server
npm run build
node test-region-code-validator.js
```

**Expected**: ✅ 12/12 tests pass

---

**Status**: ✅ DEPLOYED  
**Build**: ✅ PASSING  
**Tests**: ✅ 12/12 PASSING  
**Date**: 2026-01-20
