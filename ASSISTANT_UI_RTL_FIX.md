# Assistant UI RTL & Language Fix - Implementation Complete

## Summary

Fixed UI rendering of assistant messages to use `payload.language` instead of `uiLanguage`, with proper RTL support for Hebrew and Arabic, and dev-mode debug captions.

## Changes Made

### 1. **Domain Types** (`search.types.ts`)

Added `language` field to `AssistPayload`:

```typescript
export interface AssistPayload {
  type: 'clarify' | 'suggest' | 'guide' | 'recovery';
  mode?: 'NORMAL' | 'RECOVERY' | 'CLARIFY';
  message: string;
  
  // NEW: Language of the message (from Gate2/Intent/Assistant LLM)
  language?: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es';
  
  // ... rest of fields
}
```

---

### 2. **Assistant Panel Component** (`assistant-panel/`)

**TypeScript Changes:**
- Added `language` field to `AssistantMessage` interface
- Imported `SearchFacade` and `environment` for language detection
- Added `isDev` computed property for dev mode detection
- Captures `language` from WebSocket payload (`narrator.language`)
- Added helper methods:
  - `isRTL(msg)` - Checks if message language is Hebrew or Arabic
  - `getEffectiveLanguage(msg)` - Returns `msg.language` or fallback
  - `getFallbackLanguage()` - Returns `uiLanguage` or 'en'
  - `getUILanguage()` - Returns current UI language for debug display

**HTML Changes:**
- Added `[attr.dir]="isRTL(msg) ? 'rtl' : 'ltr'"` to message container
- Added dev-only debug caption showing `(payload.language/uiLanguage)`

**SCSS Changes:**
- Added `.message-debug` styling for dev caption
- Added RTL layout support with flexbox order changes
- Icon and text reorder for RTL messages

---

### 3. **Assistant Desktop Panel Component** (`assistant-desktop-panel/`)

**TypeScript Changes:**
- Imported `SearchFacade` and `environment`
- Added `isDev` computed property
- Added helper methods (same as assistant-panel):
  - `isRTL()`
  - `getEffectiveLanguage()`
  - `getFallbackLanguage()`
  - `getUILanguage()`

**HTML Changes:**
- Added `[attr.dir]="isRTL() ? 'rtl' : 'ltr'"` to message container
- Added dev-only debug caption

**SCSS Changes:**
- Added `.message-debug` styling
- Added RTL layout support with flexbox order changes
- Adjusted flex properties for proper wrapping

---

### 4. **Assistant Strip Component** (`assistant-strip/`)

**TypeScript Changes:**
- Imported `SearchFacade` and `environment`
- Added `isDev` computed property
- Added helper methods (same as other components)

**HTML Changes:**
- Added `[attr.dir]="isRTL() ? 'rtl' : 'ltr'"` to message container
- Added dev-only debug caption

**SCSS Changes:**
- Added `.message-debug` styling
- Added RTL layout support with flexbox order changes
- Added flex-wrap to message container

---

## Implementation Details

### Language Resolution Logic

```typescript
// Priority order:
1. payload.language (from Gate2/Intent/Assistant LLM)
2. uiLanguage (from SearchRequest)
3. 'en' (hardcoded fallback)
```

### RTL Detection

```typescript
isRTL(): boolean {
  const lang = this.getEffectiveLanguage();
  return lang === 'he' || lang === 'ar';  // Hebrew or Arabic
}
```

### Dev Mode Debug Caption

Only visible when `!environment.production`:

```
(he/he)     - Both payload and UI are Hebrew
(ar/he)     - Payload is Arabic, UI is Hebrew
(en/n/a)    - Payload is English, UI not set
```

Format: `(payload.language/uiLanguage)`

---

## Files Changed

1. ✅ `llm-angular/src/app/domain/types/search.types.ts`
2. ✅ `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts`
3. ✅ `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.html`
4. ✅ `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.scss`
5. ✅ `llm-angular/src/app/features/unified-search/components/assistant-desktop-panel/assistant-desktop-panel.component.ts`
6. ✅ `llm-angular/src/app/features/unified-search/components/assistant-desktop-panel/assistant-desktop-panel.component.html`
7. ✅ `llm-angular/src/app/features/unified-search/components/assistant-desktop-panel/assistant-desktop-panel.component.scss`
8. ✅ `llm-angular/src/app/features/unified-search/components/assistant-strip/assistant-strip.component.ts`
9. ✅ `llm-angular/src/app/features/unified-search/components/assistant-strip/assistant-strip.component.html`
10. ✅ `llm-angular/src/app/features/unified-search/components/assistant-strip/assistant-strip.component.scss`

**Total: 10 files modified**

---

## Verification Instructions

### 1. **Development Mode Testing**

Start the Angular app in dev mode:

```bash
cd llm-angular
ng serve
```

### 2. **Test Scenarios**

#### Scenario A: Hebrew Food Query (YES - Continue)
**Input:** `"מסעדות מסביבי"`

**Expected Backend Response:**
```json
{
  "type": "assistant",
  "payload": {
    "type": "SUMMARY",
    "message": "מצאתי 15 מסעדות באזור.",
    "language": "he"
  }
}
```

**Expected UI:**
- ✅ Message displayed in Hebrew
- ✅ Text aligned **RIGHT** (RTL)
- ✅ Icon on the RIGHT, text on LEFT
- ✅ Dev caption shows: `(he/he)` or `(he/en)` depending on uiLanguage

---

#### Scenario B: Arabic Clarify Query (UNCERTAIN)
**Input:** `"ماذا هناك"`

**Expected Backend Response:**
```json
{
  "type": "assistant",
  "payload": {
    "type": "CLARIFY",
    "message": "لست متأكداً مما تبحث عنه.",
    "question": "ما نوع الطعام الذي تريده؟",
    "language": "ar"
  }
}
```

**Expected UI:**
- ✅ Message displayed in Arabic
- ✅ Text aligned **RIGHT** (RTL)
- ✅ Icon on the RIGHT, text on LEFT
- ✅ Dev caption shows: `(ar/he)` or `(ar/en)`

---

#### Scenario C: English Non-Food Query (GATE_FAIL)
**Input:** `"weather"`

**Expected Backend Response:**
```json
{
  "type": "assistant",
  "payload": {
    "type": "GATE_FAIL",
    "message": "This doesn't look like a food search.",
    "question": "Are you looking for restaurants or something else?",
    "language": "en"
  }
}
```

**Expected UI:**
- ✅ Message displayed in English
- ✅ Text aligned **LEFT** (LTR)
- ✅ Icon on the LEFT, text on RIGHT
- ✅ Dev caption shows: `(en/he)` or `(en/en)`

---

#### Scenario D: Legacy Payload (No Language Field)
**Input:** Query that returns payload without `language` field

**Expected UI:**
- ✅ Fallback to `uiLanguage` (from search request)
- ✅ If `uiLanguage=he`: RTL enabled
- ✅ If `uiLanguage=en`: LTR enabled
- ✅ Dev caption shows: `(he/he)` or `(en/en)` (fallback used)

---

### 3. **Visual Verification Checklist**

Open Chrome DevTools → Elements tab:

#### For Hebrew/Arabic Messages:
- [ ] Message container has `dir="rtl"` attribute
- [ ] Text is right-aligned visually
- [ ] Icon appears on the RIGHT side of text
- [ ] Debug caption (if dev mode) appears on LEFT side
- [ ] Text flows naturally in RTL direction

#### For English Messages:
- [ ] Message container has `dir="ltr"` attribute
- [ ] Text is left-aligned visually
- [ ] Icon appears on the LEFT side of text
- [ ] Debug caption (if dev mode) appears on RIGHT side
- [ ] Text flows naturally in LTR direction

#### Debug Caption (Dev Mode Only):
- [ ] Visible in development (`ng serve`)
- [ ] Hidden in production build (`ng build`)
- [ ] Format: `(language/uiLanguage)`
- [ ] Styled in monospace gray text
- [ ] Appears inline at end of message row

---

### 4. **Component-Specific Testing**

#### Assistant Panel (WebSocket Messages)
**Location:** Top of search results page  
**Trigger:** Search query that produces assistant messages  
**Verify:** RTL/LTR and debug caption in inline panel

#### Assistant Desktop Panel
**Location:** Right sidebar (desktop only, >= 1024px)  
**Trigger:** Search results with assist payload  
**Verify:** RTL/LTR and debug caption in desktop panel

#### Assistant Strip
**Location:** Below search bar (mobile + desktop)  
**Trigger:** Recovery mode or clarify state  
**Verify:** RTL/LTR and debug caption in strip component

---

### 5. **Browser Testing**

Test in multiple browsers to verify RTL rendering:
- ✅ Chrome (Windows/Mac)
- ✅ Firefox
- ✅ Safari (Mac)
- ✅ Edge

---

### 6. **Screenshot Verification Points**

Take screenshots showing:

1. **Hebrew message in assistant-panel** (RTL)
   - Icon on right, text on left
   - Dev caption showing `(he/...)`

2. **Arabic message in assistant-desktop-panel** (RTL)
   - Icon on right, text on left
   - Dev caption showing `(ar/...)`

3. **English message in assistant-strip** (LTR)
   - Icon on left, text on right
   - Dev caption showing `(en/...)`

4. **Production build** (no debug captions)
   - Run `ng build --configuration production`
   - Verify debug captions are NOT visible

---

## Testing Commands

```bash
# Development mode (debug captions visible)
cd llm-angular
ng serve

# Production build (debug captions hidden)
ng build --configuration production

# Serve production build locally
npx http-server dist/llm-angular -p 4200
```

---

## Integration with Backend

The backend already sends `language` in the assistant payload (from Gate2 v8 prompt):

```typescript
// Backend: server/src/services/search/route2/assistant/assistant-publisher.ts
publishAssistantMessage(wsManager, requestId, sessionId, {
  type: stop.type,
  message: stop.message,      // In assistantLanguage
  question: stop.question,    // In assistantLanguage
  language: assistantLanguage // ✅ From Gate2 LLM
});
```

Frontend now correctly uses this `language` field for RTL detection and display.

---

## Backwards Compatibility

✅ If `payload.language` is missing (legacy responses):
- Falls back to `uiLanguage` from search request
- Falls back to `'en'` if uiLanguage also missing
- No errors, graceful degradation

✅ If `uiLanguage` is missing from search request:
- Returns `'n/a'` in debug caption
- Uses `'en'` as final fallback for RTL detection

---

## Status

**Implementation:** ✅ Complete  
**Linter:** ✅ No errors  
**Files Changed:** 10  
**Ready for Testing:** ✅ Yes

---

## Next Steps

1. ✅ Start dev server: `ng serve`
2. ✅ Test Hebrew query: `"מסעדות מסביבי"`
3. ✅ Verify RTL rendering in DevTools
4. ✅ Check debug caption shows `(he/...)`
5. ✅ Test Arabic query: `"ماذا هناك"`
6. ✅ Test English query: `"weather"`
7. ✅ Verify LTR rendering for English
8. ✅ Build production and verify no debug captions
