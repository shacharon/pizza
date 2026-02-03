# Language Propagation Fix - Summary

## Objective

Fix language propagation end-to-end so UI labels use `uiLanguage` and assistant messages use `payload.language`.

## Changes Made

### Backend Changes

#### 1. `assistant-publisher.ts`

**File:** `server/src/services/search/route2/assistant/assistant-publisher.ts`

- **Updated `publishAssistantMessage()` signature** to accept `assistantLanguage` parameter
- **Added language to WebSocket payload**: Now includes `language` field in `payload` with proper mapping (maps 'other' to 'en')
- **Enhanced logging**: Added `assistantLanguage` to publish logs for debugging

**Key change:**

```typescript
// Before
payload: {
  type: assistant.type,
  message: assistant.message,
  question: assistant.question,
  blocksSearch: assistant.blocksSearch,
  language: (assistant as any).language || ... // Incorrect field access
}

// After
payload: {
  type: assistant.type,
  message: assistant.message,
  question: assistant.question,
  blocksSearch: assistant.blocksSearch,
  language: wireLanguage // CRITICAL: Include language in payload for frontend directionality
}
```

#### 2. `assistant-integration.ts`

**File:** `server/src/services/search/route2/assistant/assistant-integration.ts`

- **Updated all `publishAssistantMessage()` calls** to pass `context.language` parameter
- Applied to:
  - `generateAndPublishAssistant()` - blocking assistant generation
  - `generateAndPublishAssistantDeferred()` - non-blocking assistant generation
  - `publishSearchFailedAssistant()` - error state assistant

#### 3. `websocket-protocol.ts` (Backend)

**File:** `server/src/infra/websocket/websocket-protocol.ts`

- **Made `payload.language` REQUIRED** (not optional)
- **Updated type**: `'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it'`
- **Removed top-level** `assistantLanguage` and `uiLanguage` (language is in payload now)

### Frontend Changes

#### 4. `ws-protocol.types.ts` (Frontend)

**File:** `llm-angular/src/app/core/models/ws-protocol.types.ts`

- **Added `language` field** to `WSServerAssistant.payload`
- **Type**: `'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it'`

#### 5. `assistant-routing.types.ts`

**File:** `llm-angular/src/app/facades/assistant-routing.types.ts`

- **Added `language` field** to `AssistantCardMessage` interface
- Optional field for backward compatibility with fallback chain

#### 6. `search-assistant.facade.ts`

**File:** `llm-angular/src/app/facades/search-assistant.facade.ts`

- **Updated `routeMessage()` signature** to accept `language` parameter
- **Passed language to card messages** when routing to card channel
- **Enhanced logging** with language field

#### 7. `search.facade.ts`

**File:** `llm-angular/src/app/facades/search.facade.ts`

- **Extracted language from WebSocket payload**: `narrator.language || 'en'`
- **Passed language to `routeMessage()`** when handling assistant messages

#### 8. `assistant-summary.component.ts` & `.html`

**File:** `llm-angular/src/app/features/unified-search/components/assistant-summary/`

- **Added `getMessageDir()` method**: Determines directionality per message based on `payload.language`
- **Applied `[attr.dir]` directive**: Each message now has its own directionality
- **Fallback chain**: `msg.language → uiLanguage → 'ltr'`

**Key change (HTML):**

```html
<!-- Before -->
<div class="assistant-message" [ngClass]="getMessageClass(msg.type)">
  <!-- After -->
  <div
    class="assistant-message"
    [ngClass]="getMessageClass(msg.type)"
    [attr.dir]="getMessageDir(msg)"
  ></div>
</div>
```

## Architecture

### Language Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND PIPELINE                          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Gate2/Intent Stage   │
                    │ Detects: he/en/ru/ar │
                    └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ resolveAssistantLang │
                    │ Priority:            │
                    │ 1. Intent language   │
                    │ 2. Query language    │
                    │ 3. Base filters      │
                    │ 4. UI language       │
                    │ 5. Fallback: 'en'    │
                    └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Assistant Generation │
                    │ Uses resolved lang   │
                    └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ WebSocket Publish    │
                    │ payload.language     │
                    └──────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND PIPELINE                         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Search Response      │
                    │ languageContext:     │
                    │   uiLanguage         │
                    └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ I18n Service         │
                    │ Updates UI labels    │
                    │ (Navigate/Call/etc)  │
                    └──────────────────────┘

                    ┌──────────────────────┐
                    │ WebSocket Message    │
                    │ payload.language     │
                    └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Assistant Handler    │
                    │ Routes to card       │
                    │ with language        │
                    └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Assistant Card       │
                    │ Sets dir="rtl/ltr"   │
                    │ per message          │
                    └──────────────────────┘
```

### Dual-Language Architecture

1. **UI Labels** (`uiLanguage`):

   - Source: `query.parsed.languageContext.uiLanguage` in search response
   - Synced to: `I18nService.currentLang`
   - Used for: Static UI labels (Navigate, Call, Closed, Hours unverified, etc.)
   - Supported: 8 languages (he, en, ru, ar, fr, es, de, it)

2. **Assistant Messages** (`payload.language`):
   - Source: `resolveAssistantLanguage()` in backend
   - Transmitted: WebSocket `payload.language` field
   - Used for: Assistant message directionality and text
   - Supported: 8 languages (he, en, ru, ar, fr, es, de, it)

## Verification Checklist

### Backend

- [x] `publishAssistantMessage()` accepts and uses `assistantLanguage` parameter
- [x] All calls to `publishAssistantMessage()` pass `context.language`
- [x] WebSocket protocol includes `payload.language` as required field
- [x] `resolveAssistantLanguage()` prioritizes query language over UI language

### Frontend

- [x] `WSServerAssistant` interface includes `payload.language` field
- [x] `AssistantCardMessage` includes optional `language` field
- [x] `search.facade.ts` extracts language from WebSocket payload
- [x] `assistant-summary` component uses `payload.language` for directionality
- [x] `i18n.service` syncs from search response `uiLanguage`

## Example WebSocket Payload (After Fix)

```json
{
  "type": "assistant",
  "requestId": "req-12345",
  "payload": {
    "type": "SUMMARY",
    "message": "Нашёл 8 хороших ресторанов рядом с вами.",
    "question": null,
    "blocksSearch": false,
    "language": "ru"
  }
}
```

## Test Scenario

### User Query in Russian

```
Query: "пицца рядом" (pizza nearby)
```

**Expected Behavior:**

1. **Backend** detects query language as `ru`
2. **Assistant Generation** uses Russian for message text
3. **WebSocket Publish** includes `payload.language: "ru"`
4. **Frontend UI Labels** use `uiLanguage` (from search response) - e.g., "Navigate", "Call"
5. **Assistant Card** displays with `dir="ltr"` (Russian uses LTR) and Russian text
6. **Restaurant Cards** use UI labels in Russian (from i18n service)

### Fallback Chain (Frontend)

```
payload.language → uiLanguage → 'en'
```

## Files Changed

### Backend (3 files)

1. `server/src/services/search/route2/assistant/assistant-publisher.ts`
2. `server/src/services/search/route2/assistant/assistant-integration.ts`
3. `server/src/infra/websocket/websocket-protocol.ts`

### Frontend (6 files)

1. `llm-angular/src/app/core/models/ws-protocol.types.ts`
2. `llm-angular/src/app/facades/assistant-routing.types.ts`
3. `llm-angular/src/app/facades/search-assistant.facade.ts`
4. `llm-angular/src/app/facades/search.facade.ts`
5. `llm-angular/src/app/features/unified-search/components/assistant-summary/assistant-summary.component.ts`
6. `llm-angular/src/app/features/unified-search/components/assistant-summary/assistant-summary.component.html`

## Minimal Diff Achieved

- No UI redesign
- No i18n content changes (only wiring)
- Backward compatible (language field optional in frontend types)
- Clean separation: UI labels use `uiLanguage`, assistant uses `payload.language`
