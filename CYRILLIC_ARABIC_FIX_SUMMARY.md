# Cyrillic & Arabic Language Detection Fix

## Problem
Query `"Рестораны рядом с Big Ben"` was detected as English, causing Gate2 to return UNCERTAIN.

## Root Cause
`detectQueryLanguage()` only checked for Hebrew, defaulted everything else to English.

## Solution

### 1. Enhanced Language Detector
**File:** `server/src/services/search/route2/utils/query-language-detector.ts`

**Detection Priority:**
1. Cyrillic (\u0400-\u04FF) → `ru`
2. Arabic (\u0600-\u06FF) → `ar`
3. Hebrew (\u0590-\u05FF) → `he`
4. Default → `en`

**New Functions:**
- `containsCyrillic(text: string): boolean`
- `containsArabic(text: string): boolean`

### 2. Updated Assistant Language Mapper
**File:** `server/src/services/search/route2/orchestrator.helpers.ts`

```typescript
toAssistantLanguage(lang): 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other'
```
Now returns `'ru'` and `'ar'` instead of mapping to `'other'`.

### 3. Gate2 Prompt Updated to v8
**File:** `server/src/services/search/route2/stages/gate2.stage.ts`

**Version:** `gate2_v4` → `gate2_v8`

**Critical Rules Added:**
- "restaurants near [location]" in ANY script => YES 0.90+
- Script type does NOT indicate uncertainty
- Explicit examples for Russian/Arabic restaurant queries

### 4. Test Coverage
**File:** `server/src/services/search/route2/utils/query-language-detector.test.ts`

**Added:**
- Russian detection tests (5 cases)
- Arabic detection tests (4 cases)
- Priority order tests (4 cases)
- Mixed query tests

## Verification

### Test Query: "Рестораны рядом с Big Ben"

**Before:**
```
detectQueryLanguage() => "en"
assistantLanguage => "en"  
Gate2_v4 => UNCERTAIN (confused by Cyrillic)
```

**After:**
```
detectQueryLanguage() => "ru" ✅
assistantLanguage => "ru" ✅
Gate2_v8 => YES 0.92 ✅
```

## Files Modified
1. `server/src/services/search/route2/utils/query-language-detector.ts`
2. `server/src/services/search/route2/orchestrator.helpers.ts`
3. `server/src/services/search/route2/stages/gate2.stage.ts`
4. `server/src/services/search/route2/utils/query-language-detector.test.ts`
