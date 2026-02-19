# Time Formatter Implementation

## Overview
Shared utility to format closing times with better UX: displays "24:00" instead of "00:00" for midnight closing times.

## Problem
When restaurants close at midnight, displaying "00:00" can be confusing. Users expect to see "24:00" to represent the end of the day.

## Solution
Created a centralized formatter that converts "00:00" to "24:00" for display purposes only, without mutating source data.

---

## Files Created

### 1. `shared/utils/time-formatter.ts`
Main utility with three formatter functions:

```typescript
// Format closing time string (e.g., "00:00" → "24:00")
formatClosingTime(time: string): string

// Format time from Date object
formatTimeFromDate(date: Date): string

// Format time from raw string (e.g., "0000" → "24:00")
formatTimeFromRaw(timeStr: string): string
```

### 2. `shared/utils/time-formatter.spec.ts`
Comprehensive test suite covering:
- ✅ Midnight conversion (00:00 → 24:00)
- ✅ Regular time preservation
- ✅ Edge cases and error handling
- ✅ Integration scenarios

---

## Files Modified

### `restaurant-card.component.ts`

**Changes:**
1. ✅ Imported time formatter utilities
2. ✅ Updated `formatTime()` method to use `formatTimeFromDate()`
3. ✅ Updated `getNextOpenTime()` to use `formatTimeFromRaw()`
4. ✅ Updated `getTodayHoursRange()` to use `formatTimeFromRaw()`

**Locations Updated:**
- Line 17: Added import
- Line 408: `formatTime()` method
- Line 452: Opening time formatting
- Line 468: Tomorrow opening time
- Line 508: Hours range formatting

### `restaurant-card.component.spec.ts`

**Added Test:**
New test case at line ~263: "should format midnight closing time as '24:00'"
- Verifies midnight closing times display as "24:00"
- Uses `regularOpeningHours` with `close: { time: '0000' }`
- Asserts result is "24:00" not "00:00"

---

## Behavior

### Before
```
Open now · until 00:00    ❌ Confusing
Hours: 09:00–00:00       ❌ Ambiguous
```

### After
```
Open now · until 24:00    ✅ Clear
Hours: 09:00–24:00       ✅ Unambiguous
```

---

## API

### `formatClosingTime(time: string): string`

Formats a time string for display.

**Input:** Time in format "HH:mm" or "HH:mm:ss"

**Output:** Formatted time string

**Rules:**
- `"00:00"` → `"24:00"`
- `"00:00:00"` → `"24:00"`
- `"23:30"` → `"23:30"` (unchanged)
- `"23:30:45"` → `"23:30"` (strips seconds)

**Examples:**
```typescript
formatClosingTime("00:00")     // "24:00"
formatClosingTime("00:00:00")  // "24:00"
formatClosingTime("23:30")     // "23:30"
formatClosingTime("12:00")     // "12:00"
```

---

### `formatTimeFromDate(date: Date): string`

Formats a Date object to time string.

**Input:** JavaScript Date object

**Output:** Formatted time "HH:mm"

**Examples:**
```typescript
const midnight = new Date("2024-01-01T00:00:00");
formatTimeFromDate(midnight)   // "24:00"

const evening = new Date("2024-01-01T23:30:00");
formatTimeFromDate(evening)    // "23:30"
```

---

### `formatTimeFromRaw(timeStr: string): string`

Formats raw time string (e.g., from API).

**Input:** Time in format "HHmm" (e.g., "2200", "0000")

**Output:** Formatted time "HH:mm"

**Examples:**
```typescript
formatTimeFromRaw("0000")  // "24:00"
formatTimeFromRaw("2330")  // "23:30"
formatTimeFromRaw("0900")  // "09:00"
```

---

## Design Decisions

### ✅ UI-Only Formatting
- Source data remains unchanged
- Transformation happens only at display time
- No API or database changes needed

### ✅ Single Source of Truth
- One shared utility for all time formatting
- Consistent behavior across the application
- Easy to update if requirements change

### ✅ Non-Breaking
- Only affects display, not logic
- Backwards compatible with existing code
- Can be easily reverted if needed

### ✅ Testable
- Pure functions (no side effects)
- Comprehensive test coverage
- Easy to verify correctness

---

## Usage Examples

### Restaurant Card Component

**Closing Time Today:**
```typescript
private formatTime(date: Date): string {
  return formatTimeFromDate(date); // 00:00 → 24:00
}
```

**Hours Range:**
```typescript
const openTime = formatTimeFromRaw("0900");   // "09:00"
const closeTime = formatTimeFromRaw("0000");  // "24:00"
return `${openTime}–${closeTime}`;            // "09:00–24:00"
```

**Next Opening Time:**
```typescript
const nextOpen = formatTimeFromRaw(openTimeStr); // Handles 00:00 → 24:00
```

---

## Testing

### Run Unit Tests

```bash
# Test the formatter utility
npm test -- time-formatter.spec.ts

# Test the restaurant card component
npm test -- restaurant-card.component.spec.ts
```

### Expected Test Results

**Time Formatter Tests:**
- ✅ Converts "00:00" to "24:00"
- ✅ Converts "00:00:00" to "24:00"
- ✅ Preserves other times unchanged
- ✅ Strips seconds from regular times
- ✅ Handles edge cases

**Restaurant Card Tests:**
- ✅ Displays midnight closing as "24:00"
- ✅ Formats hours range correctly
- ✅ All existing tests still pass

---

## Integration Points

### Current Usage

1. **Restaurant Card** (`restaurant-card.component.ts`)
   - Closing time display
   - Hours range display
   - Next opening time display

### Future Usage

Can be used anywhere time formatting is needed:
- Search results
- Restaurant details
- Opening hours tables
- Booking interfaces
- Any other time displays

---

## Edge Cases Handled

| Input | Output | Notes |
|-------|--------|-------|
| `"00:00"` | `"24:00"` | Midnight closing |
| `"00:00:00"` | `"24:00"` | Midnight with seconds |
| `"00:01"` | `"00:01"` | Just after midnight |
| `"23:59"` | `"23:59"` | Just before midnight |
| `"23:59:59"` | `"23:59"` | Seconds stripped |
| `""` | `""` | Empty input |
| `null` | `null` | Null input |
| `undefined` | `undefined` | Undefined input |

---

## Accessibility Notes

- **Clarity:** "24:00" is clearer than "00:00" for end-of-day
- **Consistency:** Matches common UX patterns
- **Localization Ready:** Formatter can be extended for different time formats
- **No Breaking Changes:** Doesn't affect screen readers or assistive tech

---

## Future Enhancements

Potential improvements (not in current scope):

- [ ] Support for 12-hour format (AM/PM)
- [ ] Localization for different time formats
- [ ] Support for time ranges spanning multiple days
- [ ] Custom formatting options
- [ ] Pipe version for Angular templates

---

## Maintenance

### To Change Behavior

Edit `shared/utils/time-formatter.ts`:

```typescript
export function formatClosingTime(time: string): string {
  // Modify logic here
  // All usages will automatically update
}
```

### To Add New Format

Add new function to `time-formatter.ts`:

```typescript
export function formatTimeCustom(time: string): string {
  // Custom formatting logic
}
```

### To Revert

Simply change:
```typescript
return formatTimeFromDate(date);
```

To:
```typescript
const hours = date.getHours().toString().padStart(2, '0');
const minutes = date.getMinutes().toString().padStart(2, '0');
return `${hours}:${minutes}`;
```

---

## Summary

✅ **Implemented:** Shared time formatter utility  
✅ **Applied:** All closing time displays  
✅ **Tested:** Comprehensive test coverage  
✅ **Non-Breaking:** UI-only change  
✅ **Maintainable:** Single source of truth  

**Result:** Closing times now display as "24:00" instead of "00:00" for better UX.
