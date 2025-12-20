# Language Parameter Removal - Nov 22, 2025

## Summary

Removed the confusing `language` parameter from the Places search API request. The backend now automatically detects the input language and target region using the `TranslationService`.

---

## Problem

The `language` parameter was ambiguous:

```json
{
  "text": "pizza gluten free in gedera",  // English text
  "language": "he"  // ← What does this mean???
}
```

**Issues:**
- Was it the language the user typed in? (No, they typed English!)
- Was it the language for Google API? (Maybe, but should be derived!)
- Was it the user's preferred output language? (Unclear!)

**Result:** The parameter was redundant and confusing. The `TranslationService` was already detecting language from text, making the explicit parameter unnecessary.

---

## Solution

### Removed `language` Parameter

**New Request Format:**
```json
{
  "text": "pizza gluten free in gedera",
  "userLocation": null,
  "nearMe": false,
  "browserLanguage": "en-US",  // Optional hint for fallback
  "schema": null
}
```

**Backend Auto-Detects:**
1. **Input language** (from text): English
2. **Target region** (from text or location): Israel
3. **Region language** (from region): Hebrew
4. **Google API language**: Hebrew (for better results)
5. **Output language**: English (same as input)

---

## Changes Made

### 1. Controller (`places.controller.ts`)

**Before:**
```typescript
const { text, schema, userLocation, language, nearMe, browserLanguage } = req.body || {};
// ...
const out = await chain.run({ 
    text, 
    schema: validated, 
    sessionId, 
    userLocation, 
    language,  // ← Removed
    nearMe: Boolean(nearMe),
    browserLanguage: finalBrowserLanguage
});
```

**After:**
```typescript
const { text, schema, userLocation, nearMe, browserLanguage } = req.body || {};
// ...
const out = await chain.run({ 
    text, 
    schema: validated, 
    sessionId, 
    userLocation, 
    nearMe: Boolean(nearMe),
    browserLanguage: finalBrowserLanguage
});
```

### 2. Orchestrator Interface (`places.langgraph.ts`)

**Before:**
```typescript
export interface PlacesChainInput {
    text?: string;
    schema?: PlacesIntent | null;
    sessionId?: string;
    userLocation?: { lat: number; lng: number } | null;
    language?: 'he' | 'en';  // ← Removed
    nearMe?: boolean;
    browserLanguage?: string;
}
```

**After:**
```typescript
export interface PlacesChainInput {
    text?: string;
    schema?: PlacesIntent | null;
    sessionId?: string;
    userLocation?: { lat: number; lng: number } | null;
    nearMe?: boolean;
    browserLanguage?: string;
}
```

### 3. Orchestrator Logic (`places.langgraph.ts`)

**Before:**
```typescript
let languageForIntent = input.language;

if (!input.schema && input.text) {
    const translationService = new TranslationService();
    translation = await translationService.analyzeAndTranslate(...);
    
    if (!translation.skipTranslation) {
        queryForIntent = translation.translatedQuery;
        languageForIntent = translation.regionLanguage as 'he' | 'en';
    }
}

const lang = input.language ?? effectiveIntent.search.filters?.language;
```

**After:**
```typescript
let languageForIntent: 'he' | 'en' | undefined = undefined;

if (!input.schema && input.text) {
    const translationService = new TranslationService();
    translation = await translationService.analyzeAndTranslate(...);
    
    // Always use translated query and region language
    queryForIntent = translation.translatedQuery;
    languageForIntent = translation.regionLanguage as 'he' | 'en';
}

const lang = languageForIntent ?? effectiveIntent.search.filters?.language;
```

### 4. Translation Service Fix (`translation.service.ts`)

**Fixed JSON Parsing:**
```typescript
// Before: Used llm.complete() which could return markdown
const result = await this.llm.complete(messages, { temperature: 0 });
const parsed = JSON.parse(result);  // ❌ Failed if result had ```json

// After: Strip markdown code blocks
let cleanResult = result.trim();
if (cleanResult.startsWith('```')) {
    cleanResult = cleanResult.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/,'');
}
const parsed = JSON.parse(cleanResult);  // ✅ Works
```

---

## Benefits

1. ✅ **Less Confusing:** No ambiguous parameters
2. ✅ **Smarter Backend:** Auto-detects everything
3. ✅ **Simpler Frontend:** No need to guess language
4. ✅ **Consistent Behavior:** Translation always follows the same logic
5. ✅ **Privacy-Aware:** Uses `nearMe` + `userLocation` only when user consents

---

## Flow Diagram

```
User Input
    ↓
Controller (no language param)
    ↓
Orchestrator
    ↓
TranslationService.analyzeAndTranslate()
    ├─ Detect inputLanguage (from text)
    ├─ Detect targetRegion (from text/location/browser)
    ├─ Map regionLanguage (from region)
    └─ Translate query to regionLanguage
    ↓
IntentService.resolve() (uses translated query)
    ↓
QueryBuilder → Google API (uses regionLanguage)
    ↓
TranslationService.translateResults() (back to inputLanguage)
    ↓
Return to Frontend (in user's original language)
```

---

## Testing

See `server/docs/postman-test-cases.md` for detailed test cases.

**Quick Test:**
```json
POST http://localhost:3000/api/places/search

{
  "text": "pizza gluten free in gedera",
  "userLocation": null,
  "nearMe": false,
  "schema": null
}
```

**Expected:**
- Console shows: `inputLanguage: 'en'`, `targetRegion: 'IL'`, `regionLanguage: 'he'`
- Google searches in Hebrew
- Results translated back to English

---

## Future Enhancements

### Option: Add `preferredOutputLanguage` (if needed)

If users want to override the output language:

```json
{
  "text": "פיצה בגדרה",  // Hebrew input
  "preferredOutputLanguage": "en",  // But user wants English results
  "userLocation": null,
  "nearMe": false
}
```

**Flow:**
1. Detect input: Hebrew
2. Search in Hebrew (best results)
3. Translate results to English (preferredOutputLanguage)

**Use case:** User types Hebrew but wants English results (or vice versa)

**Decision:** Not implemented for MVP. Can add later if users request it.

---

## Files Modified

1. `server/src/controllers/places/places.controller.ts`
2. `server/src/services/places/orchestrator/places.langgraph.ts`
3. `server/src/services/places/translation/translation.service.ts`

## Files Created

1. `server/docs/postman-translation-tests.json`
2. `server/docs/postman-test-cases.md`
3. `server/docs/ongoing/language-param-removal-221125.md` (this file)

---

## Status

✅ **Completed**
- Language parameter removed
- Translation service auto-detects everything
- JSON parsing fixed
- Test cases documented

**Next Steps:**
- Run Postman tests
- Verify both English and Hebrew queries return same places
- Check console logs for correct language detection


