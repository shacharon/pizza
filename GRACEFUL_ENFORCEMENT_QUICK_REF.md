# Quick Reference: Graceful Language Enforcement

## Problem

❌ Missing `langCtx` → Falls back to "en" → Language mismatch → Publish blocked

## Solution

✅ Missing `langCtx` → Derive from fallbacks → Allow publish (with warning)

---

## Behavior Matrix

| langCtx    | Match               | Behavior                              |
| ---------- | ------------------- | ------------------------------------- |
| ✅ Present | ✅ Match            | ✅ Strict pass → Publish              |
| ✅ Present | ❌ Mismatch         | ❌ Strict fail → **BLOCK**            |
| ❌ Missing | ✅ Derived match    | ✅ Graceful pass → Publish            |
| ❌ Missing | ❌ Derived mismatch | ⚠️ Graceful warn → **PUBLISH ANYWAY** |
| ❌ Missing | ⚠️ Unknown          | ⚠️ Graceful warn → **PUBLISH ANYWAY** |

---

## Code Changes

### language-enforcement.ts

```typescript
// NEW: Graceful verification
export function verifyAssistantLanguageGraceful(
  langCtx: LangCtx | undefined,
  payloadLanguage: LangCode | string | undefined,
  requestId: string,
  context: string,
  fallbackSources?: {
    uiLanguage?: 'he' | 'en';
    queryLanguage?: LangCode;
    storedLanguageContext?: any;
  }
): { allowed: boolean; expectedLanguage: LangCode | 'unknown'; ... }
```

### assistant-publisher.ts

```typescript
// BEFORE:
assertAssistantLanguage(langCtx, payload.language, requestId, context);

// AFTER:
const verification = verifyAssistantLanguageGraceful(
  langCtx,
  payload.language,
  requestId,
  context,
  { ...fallbackSources }
);
```

---

## Fallback Priority

1. **storedLanguageContext.assistantLanguage** (job metadata)
2. **fallbackSources.queryLanguage** (request)
3. **fallbackSources.uiLanguage** (client)
4. **'unknown'** (no sources available)

---

## New Logs

### Success (Graceful Match)

```json
{
  "event": "assistant_language_derived_match",
  "expected": "he",
  "actual": "he",
  "source": "ui_language"
}
```

### Warning (Graceful Mismatch)

```json
{
  "event": "assistant_language_derived_mismatch",
  "expected": "en",
  "actual": "he",
  "source": "ui_language"
}
// ⚠️ Publish still succeeds
```

### Warning (Unknown)

```json
{
  "event": "assistant_language_unverified",
  "expected": "unknown",
  "actual": "he",
  "source": "no_fallback_sources"
}
// ⚠️ Publish still succeeds
```

---

## Test Command

```bash
cd server
npm test -- src/services/search/route2/assistant/__tests__/language-enforcement-graceful.test.ts
```

---

## Files Changed

- ✅ `language-enforcement.ts` - Added graceful function
- ✅ `assistant-publisher.ts` - Use graceful verification
- ✅ `__tests__/language-enforcement-graceful.test.ts` - 10 tests (NEW)

---

## Key Principle

**When context is missing, ALLOW publish and warn.  
Only BLOCK when we have full context and detect a violation.**
