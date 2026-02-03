# Restaurant Card Time Parsing Fix

**Date**: 2026-02-03  
**Status**: ✅ FIXED - Undefined time string guards added

---

## Problem

Frontend runtime error in restaurant card component:

```
TypeError: Cannot read properties of undefined (reading 'substring')
    at _RestaurantCardComponent.getTodayHoursRange (restaurant-card.component.ts:481:41)
```

The error occurred when parsing opening hours from restaurant data where `period.open.time` or `period.close.time` was `undefined`.

---

## Root Cause

The code assumed that time strings from Google Places API would always be defined, but in some cases:
- `period.open.time` can be `undefined`
- `period.close.time` can be `undefined`

When calling `.substring()` on undefined values, JavaScript throws a TypeError.

---

## Fix Applied

Added defensive guards in **5 locations** where time strings are parsed:

### 1. `getTodayHoursRange()` - Line 481 (Original Error)

**Before**:
```typescript
const openTimeStr = period.open.time;
const closeTimeStr = period.close.time;

const openHours = openTimeStr.substring(0, 2); // ❌ Crashes if undefined
```

**After**:
```typescript
const openTimeStr = period.open.time;
const closeTimeStr = period.close.time;

// Guard: Ensure time strings are defined before parsing
if (!openTimeStr || !closeTimeStr) {
  return null;
}

const openHours = openTimeStr.substring(0, 2); // ✅ Safe
```

---

### 2. `closingTimeToday()` - Line 373

**Before**:
```typescript
const closeTimeStr = todayPeriod.close.time;
const hours = parseInt(closeTimeStr.substring(0, 2), 10); // ❌ Crashes if undefined
```

**After**:
```typescript
const closeTimeStr = todayPeriod.close.time;

// Guard: Ensure time string is defined
if (!closeTimeStr) {
  return null;
}

const hours = parseInt(closeTimeStr.substring(0, 2), 10); // ✅ Safe
```

---

### 3. `getNextOpenTime()` - Today's periods loop (Line 434)

**Before**:
```typescript
for (const period of todayPeriods) {
  const openTimeStr = period.open.time;
  const hours = parseInt(openTimeStr.substring(0, 2), 10); // ❌ Crashes if undefined
}
```

**After**:
```typescript
for (const period of todayPeriods) {
  const openTimeStr = period.open.time;
  
  // Guard: Skip if time string is undefined
  if (!openTimeStr) {
    continue;
  }
  
  const hours = parseInt(openTimeStr.substring(0, 2), 10); // ✅ Safe
}
```

---

### 4. `getNextOpenTime()` - Tomorrow's periods (Line 452)

**Before**:
```typescript
const openTimeStr = firstPeriod.open.time;
const hours = parseInt(openTimeStr.substring(0, 2), 10); // ❌ Crashes if undefined
```

**After**:
```typescript
const openTimeStr = firstPeriod.open.time;

// Guard: Ensure time string is defined
if (!openTimeStr) {
  return null;
}

const hours = parseInt(openTimeStr.substring(0, 2), 10); // ✅ Safe
```

---

### 5. Sort Operations - Lines 436 & 459

**Before**:
```typescript
.sort((a, b) => a.open.time.localeCompare(b.open.time)) // ❌ Crashes if undefined
```

**After**:
```typescript
.filter(p => p.open.day === today && p.open.time) // Filter out undefined times
.sort((a, b) => (a.open.time || '').localeCompare(b.open.time || '')) // ✅ Safe
```

---

## Impact

### Before Fix
- **Crash**: Any restaurant with missing time data caused frontend error
- **UX**: Error screen or broken card rendering
- **Scope**: All users viewing affected restaurants

### After Fix
- **Graceful degradation**: Returns `null` for missing time data
- **UX**: Card displays without hours info (instead of crashing)
- **Fallback**: Status line shows alternative info (open/closed status)

---

## Testing Scenarios

### Test Case 1: Normal restaurant with complete hours
✅ Should display: "09:00–22:00" or "Closes at 22:00"

### Test Case 2: Restaurant with missing open time
✅ Should gracefully return `null` (no crash)
✅ Status line falls back to simpler display

### Test Case 3: Restaurant with missing close time
✅ Should gracefully return `null` (no crash)
✅ Status line shows "Open now" without closing time

### Test Case 4: Restaurant with all periods missing times
✅ Should filter out invalid periods
✅ Status line shows basic open/closed status

---

## Files Modified

- `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts`
  - Added guards in 5 locations
  - No breaking changes
  - Backwards compatible

---

## Related Code

All fixes follow the same pattern:

```typescript
// Pattern: Guard before .substring()
if (!timeStr) {
  return null; // or continue in loops
}

// Now safe to parse
const hours = timeStr.substring(0, 2);
```

---

## Prevention

To prevent similar issues in the future:

1. **Always guard time parsing**: Check if time string exists before `.substring()`
2. **Filter before sort**: Remove undefined values before sorting operations
3. **Use optional chaining**: `period.open?.time` where appropriate
4. **Type safety**: Consider stricter types for Google Places data

---

## Verification

✅ No TypeScript linter errors  
✅ All guards added to substring operations  
✅ All guards added to localeCompare operations  
✅ Graceful fallback behavior implemented  
✅ No breaking changes to component API

---

## Conclusion

Fixed a critical runtime error by adding defensive guards around time string parsing. The component now gracefully handles missing or incomplete opening hours data from Google Places API without crashing.
