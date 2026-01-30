# P1-3: Split search.types.ts - Implementation Plan

**Current State**: Single 606-line types file  
**Goal**: Split into 3 focused files with clear boundaries  
**Date**: 2026-01-30

## Motivation

### Problems with Current Structure
- **High churn**: Changes to internal types affect domain types and vice versa
- **Unclear boundaries**: No clear separation between API contracts, domain models, and internal state
- **Import confusion**: Hard to know which types are "public" vs "internal"
- **Testing complexity**: Mocking becomes harder when boundaries are unclear

## Categorization Strategy

### 1. domain.types.ts (Business Domain - ~360 lines)
**Purpose**: Pure business domain types, independent of API or implementation details

**Contents**:
- **Language types** (35 lines)
  - `UILanguage`, `RequestLanguage`, `GoogleLanguage`
  - `LanguageContext`
  
- **Core domain types** (20 lines)
  - `SearchMode`, `SearchGranularity`, `Occasion`
  - `RestaurantSource`, `VerifiableBoolean`
  
- **Location types** (15 lines)
  - `Coordinates`
  - `ResolvedLocation`
  
- **Intent & Query types** (105 lines)
  - `ParsedIntent`
  - `IntentParseResult`
  
- **Restaurant types** (60 lines)
  - `RestaurantResult`
  
- **Result grouping** (20 lines)
  - `GroupKind`, `ResultGroup`
  - `StreetDetectionResult`
  
- **Suggestion types** (30 lines)
  - `RefinementChip`
  
- **Assist types** (55 lines)
  - `FailureReason`, `LiveDataVerification`
  - `AssistType`, `AssistPayload`
  
- **Clarification types** (20 lines)
  - `Clarification`, `ClarificationChoice`
  
- **Action types** (40 lines)
  - `ActionLevel`, `ActionType`
  - `ActionDefinition`, `ProposedActions`

**Why Domain?**
- These types represent business concepts
- Independent of how they're stored or transported
- Shared across all layers (API, services, UI)
- Rarely change (stable business rules)

### 2. api-contracts.types.ts (API Contracts - ~90 lines)
**Purpose**: Types that cross API boundaries (request/response contracts)

**Contents**:
- **Search parameters** (20 lines)
  - `SearchParams` - Input to search API
  
- **Core search response** (70 lines)
  - `CoreSearchResult` - Main search response
  - `CoreSearchMetadata` - Response metadata with timings

**Why API Contracts?**
- These types define the contract between client and server
- Breaking changes here affect external consumers
- Should be versioned and carefully managed
- Changes require coordination with frontend

### 3. internal-state.types.ts (Internal Implementation - ~160 lines)
**Purpose**: Internal service contracts and orchestration state

**Contents**:
- **Session types** (50 lines)
  - `SessionContext`
  - `SearchSession`
  
- **Search context** (20 lines)
  - `SearchContext` - Orchestrator-level context
  
- **Service interfaces** (90 lines)
  - `IIntentService`
  - `IGeoResolverService`
  - `IPlacesProviderService`
  - `IRankingService`
  - `ISuggestionService`
  - `ISessionService`

**Why Internal?**
- These types are implementation details
- Not exposed to external consumers
- Can change without affecting API contract
- Service-specific abstractions

## File Structure

### Before
```
services/search/types/
├── search.types.ts (606 lines)
├── response-plan.types.ts
├── intent.dto.ts
└── truth-state.types.ts
```

### After
```
services/search/types/
├── domain.types.ts (~360 lines) - NEW
├── api-contracts.types.ts (~90 lines) - NEW
├── internal-state.types.ts (~160 lines) - NEW
├── search.types.ts (~30 lines) - BARREL RE-EXPORT
├── response-plan.types.ts (unchanged)
├── intent.dto.ts (unchanged)
└── truth-state.types.ts (unchanged)
```

## Implementation Steps

### Phase 1: Create New Files (No Breaking Changes)
1. ✅ Create `domain.types.ts`
   - Copy domain types from search.types.ts
   - Keep same names (no renames)
   - Add clear section comments

2. ✅ Create `api-contracts.types.ts`
   - Copy API contract types
   - Keep same names
   - Add API versioning comment

3. ✅ Create `internal-state.types.ts`
   - Copy service interfaces and internal types
   - Keep same names
   - Add internal-only comment

### Phase 2: Convert to Barrel Re-Export
4. ✅ Update `search.types.ts` to re-export
   ```typescript
   // Barrel re-export for backward compatibility
   export * from './domain.types.js';
   export * from './api-contracts.types.js';
   export * from './internal-state.types.js';
   export * from './response-plan.types.js';
   ```

5. ✅ Verify build passes
   - All existing imports continue to work
   - No breaking changes

### Phase 3: Gradual Import Updates (Optional, Future)
6. Update imports module-by-module:
   ```typescript
   // Before
   import { RestaurantResult, SearchParams } from '../types/search.types.js';
   
   // After
   import { RestaurantResult } from '../types/domain.types.js';
   import { SearchParams } from '../types/api-contracts.types.js';
   ```

Note: This phase is optional and can be done incrementally. The barrel re-export ensures backward compatibility.

## Benefits

### Immediate (Phase 1-2)
✅ **Clearer boundaries**: Easy to see what's domain vs API vs internal
✅ **Reduced churn**: Changes to internal types don't touch domain/API files
✅ **Better discoverability**: Developers know where to find specific types
✅ **Zero breaking changes**: All existing imports continue to work

### Long-term (Phase 3)
✅ **Explicit dependencies**: Imports show which layer depends on what
✅ **Easier testing**: Mock only internal types, not domain types
✅ **Better encapsulation**: Internal types can't leak to API contracts
✅ **Improved documentation**: Each file has clear purpose statement

## Preserved Guarantees

### ✅ Backward Compatibility
- All existing imports from `search.types.ts` continue to work
- No renames (exact same type names)
- No breaking changes to type definitions
- Barrel re-export preserves all exports

### ✅ Build System
- TypeScript compilation unchanged
- No new dependencies
- Same import resolution

### ✅ Runtime Behavior
- Pure type-level refactoring
- No JavaScript changes
- Zero runtime impact

## Risk Assessment

**Risk Level**: 🟢 **VERY LOW**

### Why Low Risk?
1. ✅ **No logic changes** - Pure type organization
2. ✅ **Backward compatible** - Barrel re-export preserves all imports
3. ✅ **No renames** - All types keep exact same names
4. ✅ **Incremental** - Can update imports gradually (optional)
5. ✅ **Reversible** - Can revert by moving types back to single file

## Success Criteria

- ✅ Build passes without errors
- ✅ All existing imports resolve correctly
- ✅ No type definition changes
- ✅ Clear file boundaries with comments
- ✅ Each file < 400 lines
- ✅ Barrel re-export works correctly

## Commit Message

```
refactor(types): split search types into domain/api/internal

Split monolithic search.types.ts (606 lines) into focused files:

- domain.types.ts (~360 lines): Business domain types
  * Language, location, intent, restaurant types
  * Result grouping, suggestions, assists
  * Actions, clarifications

- api-contracts.types.ts (~90 lines): API contracts
  * SearchParams (input)
  * CoreSearchResult, CoreSearchMetadata (output)

- internal-state.types.ts (~160 lines): Internal implementation
  * SessionContext, SearchSession
  * SearchContext (orchestrator)
  * Service interfaces (IIntentService, etc.)

- search.types.ts (~30 lines): Barrel re-export for backward compat

Benefits:
✅ Clearer boundaries (domain vs API vs internal)
✅ Reduced churn (internal changes don't touch domain)
✅ Better discoverability (types organized by purpose)
✅ Zero breaking changes (barrel re-export)

All existing imports continue to work unchanged.
```

## Example Import Patterns (Future)

### Before (Current - Still Valid)
```typescript
import { RestaurantResult, SearchParams, IIntentService } from '../types/search.types.js';
```

### After (Optional, Explicit Dependencies)
```typescript
import { RestaurantResult } from '../types/domain.types.js';
import { SearchParams } from '../types/api-contracts.types.js';
import { IIntentService } from '../types/internal-state.types.js';
```

Both patterns work! The split provides clarity without forcing immediate migration.
