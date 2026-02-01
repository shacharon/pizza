# Quick Reference: Assistant Language Context Fix

## Problem

```
❌ assistant_publish_missing_langCtx: fallbackLanguage="en"
❌ LANG_ENFORCEMENT_VIOLATION: expected en, actual he
```

## Solution

Capture `langCtx` snapshot before async closure:

```typescript
// BEFORE (buggy):
export function generateAndPublishAssistantDeferred(ctx, ...) {
  (async () => {
    const assistant = await generateAssistantMessage(..., ctx.llmProvider, ...);
    publishAssistantMessage(..., ctx.langCtx, ctx.uiLanguage); // ❌ ctx.langCtx undefined here
  })();
}

// AFTER (fixed):
export function generateAndPublishAssistantDeferred(ctx, ...) {
  const langCtxSnapshot = ctx.langCtx;        // ✅ Capture NOW
  const uiLanguageSnapshot = ctx.uiLanguage;  // ✅ Capture NOW
  const llmProvider = ctx.llmProvider;        // ✅ Capture NOW

  (async () => {
    const assistant = await generateAssistantMessage(..., llmProvider, ...);
    publishAssistantMessage(..., langCtxSnapshot, uiLanguageSnapshot); // ✅ Use snapshots
  })();
}
```

## Files Changed

1. `assistant-integration.ts` - Capture snapshots
2. `assistant-publisher.ts` - Improve fallback + logs
3. `__tests__/assistant-deferred.test.ts` - 4 new tests

## Verification

```bash
cd server
npm test -- src/services/search/route2/assistant/__tests__/assistant-deferred.test.ts
```

Expected output:

```
✓ should capture langCtx snapshot and preserve Hebrew language through deferred execution
✓ should capture uiLanguage fallback when langCtx is undefined
✓ should not block caller (returns immediately)
✓ should preserve langCtx when context is mutated after call
```

## New Logs

```
✅ assistant_publish_langCtx_present (success path)
   - source: "captured_snapshot"
   - uiLanguage, assistantLanguage, queryLanguage

⚠️ assistant_publish_missing_langCtx (defensive path)
   - stage: "publish"
   - whereMissing: "publishAssistantMessage"
   - fallbackLanguage: from uiLanguage (not hardcoded "en")
```

## Impact

- ✅ No more language enforcement violations for SUMMARY
- ✅ Hebrew assistant messages work correctly
- ✅ Fallback uses request context (not hardcoded English)
- ✅ Better observability (success path now logged)
- ✅ Zero breaking changes
