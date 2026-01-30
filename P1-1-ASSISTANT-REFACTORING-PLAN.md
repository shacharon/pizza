# P1-1: Assistant LLM Service Refactoring Plan

**Current State**: Monolithic 811-line file  
**Goal**: Split by responsibility while preserving exact behavior  
**Date**: 2026-01-30

## Current Structure Analysis

### Responsibilities (811 lines)
1. **Type Definitions** (lines 19-100) - 82 lines
   - Context types (GATE_FAIL, CLARIFY, SUMMARY, etc.)
   - Output schema (Zod + JSON Schema)
   - 5 context types with strict schemas

2. **Prompt Engine** (lines 106-226) - 120 lines
   - System prompt (universal rules)
   - User prompt builders per context type
   - Language enforcement logic

3. **Schema Versioning** (lines 230-239) - 10 lines
   - Version constants
   - Schema hash generation

4. **Validation Helpers** (lines 243-303) - 61 lines
   - Hebrew text detection
   - Sentence counting
   - Format validation (max sentences, question marks)

5. **Invariant Enforcement** (lines 306-485) - 180 lines
   - Type-specific business rules
   - CLARIFY: blocksSearch=true, specific suggestedActions
   - SUMMARY: blocksSearch=false, suggestedAction=NONE
   - GATE_FAIL, SEARCH_FAILED, GENERIC_QUERY_NARRATION rules

6. **Fallback Logic** (lines 487-634) - 148 lines
   - Deterministic fallbacks per context type
   - Hebrew + English versions
   - Handles LLM failures, language mismatches, validation failures

7. **Validation Orchestration** (lines 637-696) - 60 lines
   - Language validation
   - Format validation
   - Calls fallback when needed

8. **Main LLM Call** (lines 698-811) - 114 lines
   - LLM provider orchestration
   - Call PromptEngine → LLM → Validation → Invariants
   - Error handling with fallbacks

## Proposed Module Structure

### Module 1: AssistantPromptEngine
**File**: `assistant/prompt-engine.ts`  
**Lines**: ~150 (prompts + helpers)  
**Responsibility**: Generate prompts for each context type

```typescript
export class AssistantPromptEngine {
  buildSystemPrompt(): string
  buildUserPrompt(context: AssistantContext): string
  private buildGateFailPrompt(context: AssistantGateContext): string
  private buildClarifyPrompt(context: AssistantClarifyContext): string
  private buildSummaryPrompt(context: AssistantSummaryContext): string
  private buildSearchFailedPrompt(context: AssistantSearchFailedContext): string
  private buildGenericNarrationPrompt(context: AssistantGenericQueryNarrationContext): string
}
```

**Extracts**: Lines 106-226

### Module 2: AssistantValidationEngine
**File**: `assistant/validation-engine.ts`  
**Lines**: ~400 (validation + invariants + fallbacks)  
**Responsibility**: Validate output, enforce business rules, provide fallbacks

```typescript
export class AssistantValidationEngine {
  // Main entry point
  validateAndCorrect(
    output: AssistantOutput,
    requestedLanguage: 'he' | 'en',
    context: AssistantContext,
    requestId: string
  ): AssistantOutput

  // Invariant enforcement
  private enforceInvariants(output: AssistantOutput, context: AssistantContext, requestId: string): AssistantOutput

  // Validation helpers
  private isHebrewText(text: string): boolean
  private countSentences(text: string): number
  private countQuestionMarks(text: string): number
  private validateMessageFormat(message: string, question: string | null): ValidationErrors | null

  // Fallback logic
  private getDeterministicFallback(context: AssistantContext, language: 'he' | 'en'): FallbackOutput
}
```

**Extracts**: Lines 243-696

### Module 3: AssistantLLMClient  
**File**: `assistant/llm-client.ts`  
**Lines**: ~150 (orchestration)  
**Responsibility**: Orchestrate LLM calls with validation

```typescript
export class AssistantLLMClient {
  constructor(
    private promptEngine: AssistantPromptEngine,
    private validationEngine: AssistantValidationEngine
  ) {}

  async generateMessage(
    context: AssistantContext,
    llmProvider: LLMProvider,
    requestId: string,
    opts?: GenerationOptions
  ): Promise<AssistantOutput>
}
```

**Extracts**: Lines 698-811 (main function logic)

### Module 4: AssistantTypes (Shared)
**File**: `assistant/assistant.types.ts`  
**Lines**: ~100 (types + schema)  
**Responsibility**: Shared type definitions and schemas

```typescript
// All context types
// AssistantOutput schema (Zod + JSON)
// Schema versioning constants
```

**Extracts**: Lines 19-100, 230-239

### Refactored Main File
**File**: `assistant-llm.service.ts`  
**Lines**: ~50-80 (thin facade)  
**Responsibility**: Backward-compatible exports

```typescript
import { AssistantLLMClient } from './llm-client.js';
import { AssistantPromptEngine } from './prompt-engine.js';
import { AssistantValidationEngine } from './validation-engine.js';

// Re-export types for backward compatibility
export * from './assistant.types.js';

// Create singleton instances
const promptEngine = new AssistantPromptEngine();
const validationEngine = new AssistantValidationEngine();
const llmClient = new AssistantLLMClient(promptEngine, validationEngine);

// Main export (backward compatible)
export async function generateAssistantMessage(
  context: AssistantContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts?: GenerationOptions
): Promise<AssistantOutput> {
  return llmClient.generateMessage(context, llmProvider, requestId, opts);
}
```

## Non-Negotiable Preservation

### ✅ Must Remain Identical
1. **Output schemas**: No changes to Zod schema or JSON schema
2. **WS channel**: Assistant publishes to 'search' channel
3. **Cache keys**: Not used in this module (no caching)
4. **Language selection**: Same logic for 'he'/'en'/'other'
5. **Outputs**: Same output for same input (deterministic)

### ✅ Log Event Names (Unchanged)
- `assistant_llm_start`
- `assistant_llm_success`
- `assistant_llm_failed`
- `assistant_invariant_enforced`
- `assistant_invariant_violation_enforced`
- `assistant_invariant_observation`
- `assistant_invariants_applied`
- `assistant_validation_failed`

### ✅ Constants (Unchanged)
- `ASSISTANT_SCHEMA_VERSION = 'v3_strict_validation'`
- `ASSISTANT_PROMPT_VERSION = 'v2_language_enforcement'`
- `ASSISTANT_SCHEMA_HASH` (computed from JSON schema)

## Implementation Order

### Phase 1: Extract Types (Low Risk)
1. Create `assistant.types.ts`
2. Move type definitions and schemas
3. Update imports in main file
4. Verify build passes

### Phase 2: Extract PromptEngine (Low Risk)
1. Create `prompt-engine.ts`
2. Move prompt building logic
3. Make pure functions/class methods
4. Update main file to use PromptEngine
5. Verify build + tests

### Phase 3: Extract ValidationEngine (Medium Risk)
1. Create `validation-engine.ts`
2. Move all validation, invariants, fallbacks
3. Keep method signatures identical
4. Update main file to use ValidationEngine
5. Verify build + tests

### Phase 4: Extract LLMClient (Medium Risk)
1. Create `llm-client.ts`
2. Move main orchestration logic
3. Wire up PromptEngine + ValidationEngine
4. Update main file as thin facade
5. Verify build + tests

### Phase 5: Verify Identical Behavior
1. Run all existing tests
2. Add integration test if needed
3. Verify outputs match exactly

## Testing Strategy
- Use existing test suite
- Add test: same input → same output (before/after refactoring)
- No new tests needed unless behavior clarification required

## Success Criteria
✅ Main file < 100 lines (from 811)  
✅ 4 focused modules created  
✅ All tests pass  
✅ No changes to public API  
✅ No changes to output behavior  
✅ No changes to log event names  
✅ Improved maintainability (SOLID)  

## Estimated Impact
- **Before**: 811 lines in one file
- **After**: 
  - Main file: ~80 lines (facade)
  - Types: ~100 lines
  - PromptEngine: ~150 lines
  - ValidationEngine: ~400 lines
  - LLMClient: ~150 lines
- **Total**: ~880 lines (slightly more due to module boilerplate)
- **Risk**: Low (incremental, pure extractions)
