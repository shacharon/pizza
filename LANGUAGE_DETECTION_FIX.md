# Language Detection Fix for Cyrillic & Arabic

## Bug Fixed
**Problem:** Query "Рестораны рядом с Big Ben" detected as `queryLanguage="en"`, causing Gate2 to return UNCERTAIN.

## Changes

### 1. query-language-detector.ts
**Function: `detectQueryLanguage()`**

**Before:**
```typescript
export function detectQueryLanguage(query: string): 'he' | 'en' {
  // Only detected Hebrew, everything else => 'en'
  if (/[\u0590-\u05FF]/.test(query)) {
    return 'he';
  }
  return 'en';
}
```

**After:**
```typescript
export function detectQueryLanguage(query: string): 'he' | 'en' | 'ru' | 'ar' {
  // Priority 1: Cyrillic (Russian)
  if (/[\u0400-\u04FF]/.test(query)) {
    return 'ru';
  }
  // Priority 2: Arabic
  if (/[\u0600-\u06FF]/.test(query)) {
    return 'ar';
  }
  // Priority 3: Hebrew
  if (/[\u0590-\u05FF]/.test(query)) {
    return 'he';
  }
  // Priority 4: Default English
  return 'en';
}
```

**Added helpers:**
- `containsCyrillic()` - Check for Cyrillic chars
- `containsArabic()` - Check for Arabic chars

### 2. orchestrator.helpers.ts
**Function: `toAssistantLanguage()`**

**Before:**
```typescript
export function toAssistantLanguage(lang: unknown): 'he' | 'en' | 'other' {
  if (normalized === 'he') return 'he';
  if (normalized === 'en') return 'en';
  // Map ru/ar/fr/es to 'other'
  return 'other';
}
```

**After:**
```typescript
export function toAssistantLanguage(lang: unknown): 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other' {
  if (normalized === 'he') return 'he';
  if (normalized === 'en') return 'en';
  if (normalized === 'ru') return 'ru';  // ✅ Now supported
  if (normalized === 'ar') return 'ar';  // ✅ Now supported
  if (normalized === 'fr') return 'fr';
  if (normalized === 'es') return 'es';
  return 'other';
}
```

### 3. gate2.stage.ts
**Prompt Version:** `gate2_v4` → `gate2_v8`

**Updated Rules:**
```
- YES: user wants food/restaurants. Includes:
  1) ANY food/venue terms in ANY language (pizza, sushi, מסעדה, рестораны, مطاعم, שווארמיה).
  2) "restaurants" + location in ANY language => YES 0.90+ (not UNCERTAIN).

CRITICAL RULE:
- "restaurants near [location]" in ANY script (Latin/Cyrillic/Arabic/Hebrew) => YES 0.90+.
- Script type does NOT indicate uncertainty - judge by MEANING only.
```

**New Examples:**
```
"restaurants near Big Ben" -> {"foodSignal":"YES","confidence":0.92}
"Рестораны рядом с Big Ben" -> {"foodSignal":"YES","confidence":0.92}
"مطاعم قريبة مني" -> {"foodSignal":"YES","confidence":0.95}
```

### 4. query-language-detector.test.ts
**Added test coverage:**
- ✅ Russian (Cyrillic) detection
- ✅ Arabic detection  
- ✅ Priority order (strong scripts over English)
- ✅ Mixed queries (Cyrillic + Latin)

## Test Cases Added

### Russian Detection
```typescript
"Рестораны рядом со мной" => 'ru'
"Рестораны рядом с Big Ben" => 'ru' // ✅ Cyrillic detected even with English
"5 лучших ресторанов" => 'ru'
```

### Arabic Detection
```typescript
"مطاعم قريبة مني" => 'ar'
"مطاعم pizza" => 'ar' // ✅ Arabic detected even with English
```

### Priority Order
```typescript
"Рестораны near Big Ben" => 'ru' // Cyrillic takes precedence
"مطاعم restaurants" => 'ar' // Arabic takes precedence
"restaurants near Moscow Москва" => 'ru' // Even with majority English
```

## Result

### Before Bug Fix:
```
Query: "Рестораны рядом с Big Ben"
→ detectQueryLanguage() => "en" ❌
→ assistantLanguage => "en" ❌
→ Gate2 => UNCERTAIN (confused by Cyrillic) ❌
```

### After Bug Fix:
```
Query: "Рестораны рядом с Big Ben"
→ detectQueryLanguage() => "ru" ✅
→ assistantLanguage => "ru" ✅
→ Gate2_v8 => YES 0.92 (understands multilingual restaurant queries) ✅
```

## Files Modified
1. `server/src/services/search/route2/utils/query-language-detector.ts`
2. `server/src/services/search/route2/orchestrator.helpers.ts`
3. `server/src/services/search/route2/stages/gate2.stage.ts`
4. `server/src/services/search/route2/utils/query-language-detector.test.ts`
