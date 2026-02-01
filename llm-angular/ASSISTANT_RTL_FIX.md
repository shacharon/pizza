# Assistant Payload Language + RTL Fix

## Overview
Fixed UI rendering of assistant messages to use `payload.language` for RTL support and display text exactly as provided by the backend.

## Changes Made

### 1. **Types Updated**

#### `assistant-routing.types.ts`
- ✅ Added `language` field to `AssistantCardMessage` interface
- Type: `'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'`

#### `ws-protocol.types.ts`
- ✅ Extended `WSServerAssistant.payload.language` to include all supported languages
- Before: `'he' | 'en'`
- After: `'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'`

#### `assistant-message.mapper.ts`
- ✅ Added `language` field to `AssistantMessageModel` interface
- ✅ Added `language` field to `RawAssistantPayload` interface
- ✅ Updated `extractAssistantMessage()` to pass through `payload.language`

### 2. **Component Updated**

#### `assistant-summary.component.ts`
Added:
- ✅ `isDevMode` flag (Angular core)
- ✅ `getMessageLanguage(msg)` - Get language with fallback: payload.language → uiLanguage → 'en'
- ✅ `isRTL(language)` - Check if language requires RTL (he, ar)
- ✅ `getTextDirection(msg)` - Get 'rtl' or 'ltr' based on message language

#### `assistant-summary.component.html`
Added:
- ✅ `[attr.dir]="getTextDirection(msg)"` on each message div
- ✅ Dev mode debug view showing `payload.language` and `uiLanguage`

#### `assistant-summary.component.scss`
Added:
- ✅ RTL text alignment for `[dir="rtl"]` messages
- ✅ `.language-debug` styling (yellow background, monospace font)

---

## Rendering Logic

### Language Resolution
```typescript
// Priority order:
1. payload.language  (from backend Gate2 LLM)
2. uiLanguage       (from client request)
3. 'en'             (fallback)
```

### RTL Detection
```typescript
isRTL(language) {
  return language === 'he' || language === 'ar';
}
```

### Text Direction
```typescript
getTextDirection(msg) {
  const lang = getMessageLanguage(msg);
  return isRTL(lang) ? 'rtl' : 'ltr';
}
```

---

## Verification Instructions

### Test Scenarios

#### 1. **Arabic Query (RTL)**
**Query:** `"أخبار"` (news in Arabic)

**Expected Backend Response:**
```json
{
  "type": "assistant",
  "requestId": "req-123",
  "payload": {
    "type": "GATE_FAIL",
    "message": "هذا لا يبدو كبحث عن طعام.",
    "question": "هل تبحث عن مطاعم أم شيء آخر؟",
    "blocksSearch": true,
    "language": "ar"
  }
}
```

**UI Verification:**
- ✅ Text aligned RIGHT (RTL)
- ✅ Arabic text displayed exactly as sent (no translation)
- ✅ `dir="rtl"` attribute on message div
- ✅ Dev mode: Shows `payload.language: ar | uiLanguage: en`

**Screenshot Location:** 
- Assistant card in search page
- Check text alignment and direction attribute in browser DevTools

---

#### 2. **Hebrew Query (RTL)**
**Query:** `"מה יש"`

**Expected Backend Response:**
```json
{
  "type": "assistant",
  "requestId": "req-456",
  "payload": {
    "type": "CLARIFY",
    "message": "אני לא בטוח מה אתה מחפש.",
    "question": "איזה סוג אוכל אתה רוצה?",
    "blocksSearch": true,
    "language": "he"
  }
}
```

**UI Verification:**
- ✅ Text aligned RIGHT (RTL)
- ✅ Hebrew text displayed exactly as sent
- ✅ `dir="rtl"` attribute on message div
- ✅ Dev mode: Shows `payload.language: he | uiLanguage: en`

---

#### 3. **English Query (LTR)**
**Query:** `"weather"`

**Expected Backend Response:**
```json
{
  "type": "assistant",
  "requestId": "req-789",
  "payload": {
    "type": "GATE_FAIL",
    "message": "This doesn't look like a food search.",
    "question": "Are you looking for restaurants or something else?",
    "blocksSearch": true,
    "language": "en"
  }
}
```

**UI Verification:**
- ✅ Text aligned LEFT (LTR)
- ✅ English text displayed exactly as sent
- ✅ `dir="ltr"` attribute on message div
- ✅ Dev mode: Shows `payload.language: en | uiLanguage: en`

---

#### 4. **Russian Query (LTR)**
**Query:** `"что есть"`

**Expected Backend Response:**
```json
{
  "type": "assistant",
  "requestId": "req-101",
  "payload": {
    "type": "CLARIFY",
    "message": "Я не уверен, что вы ищете.",
    "question": "Какую еду вы хотите?",
    "blocksSearch": true,
    "language": "ru"
  }
}
```

**UI Verification:**
- ✅ Text aligned LEFT (LTR)
- ✅ Russian text displayed exactly as sent
- ✅ `dir="ltr"` attribute on message div
- ✅ Dev mode: Shows `payload.language: ru | uiLanguage: en`

---

#### 5. **Missing Language (Fallback)**
**Query:** Any query, backend sends old format without language field

**Expected Backend Response:**
```json
{
  "type": "assistant",
  "requestId": "req-202",
  "payload": {
    "type": "GATE_FAIL",
    "message": "זה לא נראה כמו חיפוש אוכל.",
    "question": null,
    "blocksSearch": true
    // NO language field
  }
}
```

**UI Verification:**
- ✅ Fallback to `uiLanguage` (client setting)
- ✅ If uiLanguage='he' → dir="rtl"
- ✅ If uiLanguage='en' → dir="ltr"
- ✅ Dev mode: Shows `payload.language: missing | uiLanguage: he`

---

## Dev Mode Debug View

### How to Enable
Dev mode is automatically enabled when running:
```bash
ng serve
```

### What You See
Small yellow box at bottom of each assistant message:
```
📍 payload.language: ar | uiLanguage: en
```

### Fields Shown
- `payload.language`: Language from backend response (or "missing")
- `uiLanguage`: UI language from client request

### Styling
- Background: Yellow (`#fff3cd`)
- Font: Monospace
- Color: Brown (`#856404`)
- Font size: 0.7rem

---

## Where to Verify in UI

### Components Affected
1. **`app-assistant-summary`** (Main component)
   - Location: Bottom of search results page
   - Shows: GATE_FAIL, CLARIFY, SUMMARY cards

### DevTools Inspection

**Check RTL Direction:**
```html
<div class="assistant-message message-type-gate_fail" dir="rtl">
  <span class="message-icon">⚠️</span>
  <div class="message-content">
    <div class="message-text">هذا لا يبدو كبحث عن طعام.</div>
    <div class="message-question">هل تبحث عن مطاعم أم شيء آخر؟</div>
    <!-- DEV MODE -->
    <div class="language-debug">
      <small>📍 payload.language: ar | uiLanguage: en</small>
    </div>
  </div>
</div>
```

**Check CSS Text Alignment:**
```css
.assistant-message[dir="rtl"] {
  text-align: right;
}
```

---

## Files Changed

1. ✅ `llm-angular/src/app/facades/assistant-routing.types.ts`
   - Added `language` field to `AssistantCardMessage`

2. ✅ `llm-angular/src/app/core/models/ws-protocol.types.ts`
   - Extended `language` type to all supported languages

3. ✅ `llm-angular/src/app/domain/mappers/assistant-message.mapper.ts`
   - Added `language` to model interfaces
   - Pass through `payload.language` in mapper

4. ✅ `llm-angular/src/app/features/unified-search/components/assistant-summary/assistant-summary.component.ts`
   - Added RTL detection logic
   - Added dev mode flag
   - Added language resolution methods

5. ✅ `llm-angular/src/app/features/unified-search/components/assistant-summary/assistant-summary.component.html`
   - Added `[attr.dir]` binding
   - Added dev mode debug view

6. ✅ `llm-angular/src/app/features/unified-search/components/assistant-summary/assistant-summary.component.scss`
   - Added RTL text alignment
   - Added `.language-debug` styling

---

## Testing Checklist

### Manual Testing
- [ ] Run `ng serve` to start dev server
- [ ] Search Arabic query: `"أخبار"` → Verify RTL + Arabic text
- [ ] Search Hebrew query: `"מה יש"` → Verify RTL + Hebrew text
- [ ] Search English query: `"weather"` → Verify LTR + English text
- [ ] Search Russian query: `"что есть"` → Verify LTR + Russian text
- [ ] Check dev mode debug view appears (yellow box)
- [ ] Verify debug shows correct `payload.language`
- [ ] Inspect HTML: Verify `dir="rtl"` or `dir="ltr"` attribute
- [ ] Verify text not translated (displayed exactly as backend sent)

### Browser DevTools
- [ ] Open Elements tab
- [ ] Find `.assistant-message` div
- [ ] Verify `dir="rtl"` for Arabic/Hebrew
- [ ] Verify `dir="ltr"` for English/Russian/French/Spanish
- [ ] Check Computed styles: `text-align: right` for RTL

### Production Build
- [ ] Run `ng build --configuration production`
- [ ] Verify dev mode debug view NOT shown in production
- [ ] Verify RTL still works in production

---

## Backward Compatibility

### Missing Language Field
If backend sends old format without `payload.language`:
- ✅ Fallback to `uiLanguage` from client request
- ✅ If `uiLanguage` missing → fallback to `'en'`
- ✅ No errors, graceful degradation

### Old Message Format
Legacy `AssistantMessage` interface still supported:
- ✅ Uses `locale` input for direction
- ✅ No breaking changes

---

## Benefits

1. **RTL Support**: Automatic right-to-left text alignment for Hebrew/Arabic
2. **No Translation**: Text displayed exactly as backend generates it
3. **Language Consistency**: Single source of truth (backend Gate2 LLM)
4. **Dev Observability**: Easy debugging with language display
5. **Backward Compatible**: Graceful fallback for missing language field

---

## Screenshot Instructions

### Where to Take Screenshots

**1. Arabic GATE_FAIL Card (RTL)**
- Query: `"أخبار"`
- Location: Search results page, assistant card area
- Show: Right-aligned Arabic text + dev mode debug

**2. Hebrew CLARIFY Card (RTL)**
- Query: `"מה יש"`
- Location: Search results page, assistant card area
- Show: Right-aligned Hebrew text + dev mode debug

**3. English GATE_FAIL Card (LTR)**
- Query: `"weather"`
- Location: Search results page, assistant card area
- Show: Left-aligned English text + dev mode debug

**4. DevTools Inspection**
- Right-click on assistant message → Inspect
- Show: `dir="rtl"` attribute in HTML
- Show: `text-align: right` in Computed styles

**5. Dev Mode Debug View Close-Up**
- Zoom in on yellow debug box
- Show: `📍 payload.language: ar | uiLanguage: en`

---

**Status:** ✅ Implemented  
**Linter:** ✅ No errors  
**Testing:** Pending manual verification  
**Documentation:** This file
