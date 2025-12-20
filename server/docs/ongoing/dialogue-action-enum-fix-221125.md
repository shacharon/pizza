# Dialogue Action Enum Validation Fix

**Date:** November 22, 2025  
**Status:** ✅ Fixed

---

## Problem

LLM generated invalid `action` value in suggestions, causing Zod validation error:

```
Error: Invalid enum value. Expected 'filter' | 'refine' | 'info' | 'map', received 'search'
```

**Root Cause:** The Call 2 prompt didn't explicitly list the valid action types, so the LLM invented its own (`'search'`).

---

## Solution

Added explicit list of valid action types to the Call 2 prompt:

```typescript
VALID ACTION TYPES (MUST use one of these):
- "filter" - Apply a filter (e.g., parking, vegan, romantic)
- "refine" - Refine search (e.g., cheaper, nearby)
- "info" - Get more info (e.g., call, website, hours)
- "map" - Show on map

DO NOT use: "search", "query", or any other action type!
```

---

## Files Changed

- `server/src/services/dialogue/dialogue.service.ts`
  - Updated `generateResponseTwoCall()` Call 2 prompt

---

## Test

Restart server and test again:

```
User: "אני מחפש מסעדת המבורגר בגדרה"
Expected: No Zod errors, valid suggestions with correct action types
```

---

## Lesson Learned

When using `completeJSON()` with strict schemas:
1. ✅ Always explicitly list enum values in the prompt
2. ✅ Show examples with valid values
3. ✅ Add "DO NOT use" warnings for common mistakes


