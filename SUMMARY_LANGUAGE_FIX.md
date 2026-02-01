# Assistant SUMMARY Language Enforcement - Implementation Summary

## Problem
Assistant SUMMARY messages were outputting English even when `requestedLanguage` was set to `ru` (Russian) or `ar` (Arabic). The LLM was being influenced by English restaurant names and query text instead of strictly following the `requestedLanguage` parameter.

## Scope
- **Only Assistant SUMMARY LLM call** - No changes to search logic, routing, WS contracts, or schemas outside Assistant
- **Focused on language enforcement** - Hardened prompt rules and validation

## Changes Made

### 1. Schema Updates (`assistant.types.ts`)
- **Added `outputLanguage` field** to `AssistantOutputSchema` and JSON schema
- Made `outputLanguage` **required** in JSON schema for hardened validation
- Updated schema versions:
  - `ASSISTANT_SCHEMA_VERSION`: `v3_strict_validation` → `v4_output_language`
  - `ASSISTANT_PROMPT_VERSION`: `v2_language_enforcement` → `v3_hard_language_rule`

### 2. System Prompt Updates (`prompt-engine.ts`)

#### Updated SYSTEM_PROMPT:
Added **CRITICAL LANGUAGE RULE** section:
```
- CRITICAL LANGUAGE RULE: 
  * Respond in the EXACT language specified by "Language:" field in the user prompt
  * NEVER output English unless requestedLanguage="en"
  * IGNORE the language of restaurant names, query text, or any input data
  * For SUMMARY type: Output ONLY in requestedLanguage, regardless of input language
  * Set outputLanguage field to the SAME value as the requestedLanguage
```

#### Enhanced SUMMARY User Prompt:
- Changed language hint from generic to explicit per-language instructions
- Added support for all 6 languages: `he`, `en`, `ru`, `ar`, `fr`, `es`
- **Critical additions:**
  ```
  CRITICAL LANGUAGE RULE (READ CAREFULLY):
  - You MUST write in [Language] ONLY
  - IGNORE the language of restaurant names (they may be in English)
  - IGNORE the language of the query text
  - IGNORE any English or mixed-language data in the input
  - Set outputLanguage field to: [requestedLanguage]
  - If requestedLanguage=ru, write ONLY in Russian (Cyrillic script)
  - If requestedLanguage=ar, write ONLY in Arabic script
  - Never output English unless requestedLanguage=en
  ```
- Replaced generic "Language: X" with explicit "requestedLanguage: X"
- **Removed any reference to `uiLanguage`** from prompts

### 3. Validation Engine Updates (`validation-engine.ts`)

#### Added outputLanguage Validation (Step 0):
New validation step **before** existing language compliance checks:
```typescript
// Check if LLM set outputLanguage field correctly
if (output.outputLanguage && output.outputLanguage !== requestedLanguage) {
  // Trigger deterministic fallback in correct language
  return fallback with requestedLanguage
}
```

#### Updated All Fallback Returns:
All validation fallbacks now set:
```typescript
{
  language: requestedLanguage,
  outputLanguage: requestedLanguage
}
```

### 4. LLM Client Updates (`llm-client.ts`)
- Updated error fallback to include `outputLanguage: questionLanguage`

### 5. Comprehensive Tests (`summary-language-enforcement.test.ts`)

Created 6 test cases covering:

#### Test Suite 1: Russian (ru)
- ✅ Should output Russian when `requestedLanguage=ru`, `uiLanguage=en`, English restaurant names
- ✅ Should trigger fallback if LLM outputs English instead of Russian

#### Test Suite 2: Arabic (ar)
- ✅ Should output Arabic when `requestedLanguage=ar`, `uiLanguage=he`, mixed input
- ✅ Should trigger fallback if `outputLanguage` mismatch (outputLanguage=en but requested=ar)

#### Test Suite 3: Prompt Verification
- ✅ Should pass `requestedLanguage` in user prompt (not `uiLanguage`)
- ✅ Verifies prompt includes "IGNORE the language of restaurant names"
- ✅ Verifies prompt does NOT contain `uiLanguage` anywhere

#### Test Suite 4: Integration
- ✅ Should enforce Russian output even with English-heavy input (all metadata in English)

All tests **passed** ✅

## What Was NOT Changed

Per requirements, these were intentionally **not modified**:
- Search logic and routing
- WebSocket contracts (WS message format unchanged)
- Schemas outside Assistant module
- Post-hoc language enforcement (kept as-is)
- Existing fallback generator (kept unchanged)

## Verification

### Test Results:
```
✅ SUMMARY Language Enforcement - All 6 tests passed
✅ Assistant Publisher Enforcement - All tests passed  
✅ SUMMARY Invariant Tests - All tests passed
✅ Language Compliance Tests - All tests passed (1 pre-existing failure unrelated)
```

### Key Log Events Added:
- `assistant_output_language_mismatch` - Logged when LLM outputs wrong `outputLanguage`
- Updated telemetry to include new schema/prompt versions

## How It Works

### Flow:
1. **Context Creation**: `AssistantSummaryContext` receives `requestedLanguage` from intent detection
2. **Prompt Generation**: 
   - System prompt emphasizes hard language rule
   - User prompt explicitly states `requestedLanguage` and tells LLM to ignore input language
   - **No `uiLanguage` is passed to LLM**
3. **LLM Response**: LLM must set `outputLanguage` field matching `requestedLanguage`
4. **Validation** (3 layers):
   - **Layer 1**: Check `outputLanguage === requestedLanguage` (NEW)
   - **Layer 2**: Check message text language compliance (existing)
   - **Layer 3**: Legacy Hebrew-specific check (backward compat)
5. **Fallback**: If any validation fails, use deterministic fallback in correct language

### Example:
```typescript
// Input
requestedLanguage: 'ru'
query: 'pizza restaurants' (English)
top3Names: ['Pizza Hut', 'Dominos', 'Papa Johns'] (English)

// LLM Prompt
requestedLanguage: ru
CRITICAL: IGNORE English restaurant names, output ONLY Russian
Set outputLanguage: ru

// Expected Output
{
  message: 'Найдено 5 ресторанов пиццы поблизости.',
  outputLanguage: 'ru',
  language: 'ru'
}
```

## Files Changed

### Core Implementation:
- `server/src/services/search/route2/assistant/assistant.types.ts` - Schema + outputLanguage field
- `server/src/services/search/route2/assistant/prompt-engine.ts` - Hardened prompts
- `server/src/services/search/route2/assistant/validation-engine.ts` - outputLanguage validation
- `server/src/services/search/route2/assistant/llm-client.ts` - Fallback updates

### Tests:
- `server/src/services/search/route2/assistant/__tests__/summary-language-enforcement.test.ts` - **NEW** comprehensive test suite

## Next Steps (Optional)

If language leakage persists in production:
1. Monitor `assistant_output_language_mismatch` log events
2. Consider adding few-shot examples to prompt for ru/ar
3. Consider using function calling mode if JSON mode is less reliable
4. Add A/B test between models (gpt-4o vs gpt-4o-mini) for language compliance

## Deployment Notes

- **Backward Compatible**: New `outputLanguage` field is optional in Zod schema (though required in JSON schema)
- **No Breaking Changes**: Existing WS clients will continue to work
- **Telemetry Updated**: New schema/prompt versions will appear in logs
- **Graceful Degradation**: Validation failures trigger safe fallbacks in correct language
