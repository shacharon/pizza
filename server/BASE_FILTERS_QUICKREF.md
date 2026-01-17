# Route2 BaseFilters - Quick Reference

## Import

```typescript
import { resolveBaseFiltersLLM } from './shared/base-filters-llm.js';
import { tightenSharedFilters } from './shared/shared-filters.tighten.js';
import type { PreGoogleBaseFilters, FinalSharedFilters } from './shared/shared-filters.types.js';
```

## Usage in Pipeline

```typescript
// After ROUTE_LLM, before GOOGLE_MAPS:

// 1. Resolve base filters via LLM (900ms timeout)
const baseFilters = await resolveBaseFiltersLLM({
  query: request.query,
  route: intentDecision.route,
  llmProvider: ctx.llmProvider,
  requestId: ctx.requestId,
  ...(ctx.traceId && { traceId: ctx.traceId }),
  ...(ctx.sessionId && { sessionId: ctx.sessionId })
});

// 2. Tighten to final filters (<1ms)
const finalFilters = tightenSharedFilters({
  base: baseFilters,
  gateLanguage: gateResult.gate.language,
  defaultRegion: ctx.userRegionCode || 'IL',
  requestId: ctx.requestId
});

// 3. Store in context
ctx.sharedFilters = {
  preGoogle: baseFilters,
  final: finalFilters
};
```

## Access in Later Stages

```typescript
// In Google Maps stage or response builder:
const filters = ctx.sharedFilters?.final;

if (filters) {
  // Apply openNow filter
  if (filters.openNow) {
    // Filter results by currentOpeningHours.openNow
  }
  
  // Use language
  const lang = filters.language; // 'he' | 'en'
  
  // Use region
  const region = filters.regionCode; // 'IL', 'FR', etc.
  
  // Include disclaimers in response
  const disclaimers = filters.disclaimers; // { hours: true, dietary: true }
}
```

## Type Reference

```typescript
// PreGoogleBaseFilters (from LLM)
type PreGoogleBaseFilters = {
  language: 'he' | 'en' | 'auto';
  openNow: boolean;
  regionHint?: string;  // Optional, 2-char ISO
};

// FinalSharedFilters (after tightening)
type FinalSharedFilters = {
  language: 'he' | 'en';  // Resolved (no 'auto')
  openNow: boolean;
  regionCode: string;  // Required, uppercase
  disclaimers: {
    hours: true;
    dietary: true;
  };
};

// Context
interface Route2Context {
  // ... existing fields
  sharedFilters?: {
    preGoogle?: PreGoogleBaseFilters;
    final?: FinalSharedFilters;
  };
}
```

## Quick Examples

### Example 1: Open Now Query
```typescript
// Query: "פיצה פתוחה עכשיו בתל אביב"

// base (from LLM):
{ language: 'he', openNow: true, regionHint: 'IL' }

// final (after tighten):
{
  language: 'he',
  openNow: true,
  regionCode: 'IL',
  disclaimers: { hours: true, dietary: true }
}
```

### Example 2: Foreign Location
```typescript
// Query: "restaurant in Paris"

// base:
{ language: 'en', openNow: false, regionHint: 'FR' }

// final:
{
  language: 'en',
  openNow: false,
  regionCode: 'FR',
  disclaimers: { hours: true, dietary: true }
}
```

### Example 3: Fallback (LLM failure)
```typescript
// Query: any (LLM times out)

// base (fallback):
{ language: 'auto', openNow: false }

// final (resolved):
{
  language: 'he',  // From gateLanguage
  openNow: false,
  regionCode: 'IL',  // From defaultRegion
  disclaimers: { hours: true, dietary: true }
}
```

## Performance

- **BASE_FILTERS_LLM**: ~300-900ms (capped)
- **TIGHTEN**: <1ms
- **Total added**: ~300-900ms per search

## Error Handling

```typescript
try {
  const base = await resolveBaseFiltersLLM({...});
  // Always returns valid filters (fallback on error)
} catch {
  // Never throws - fallback is built-in
}

const final = tightenSharedFilters({...});
// Always succeeds - no I/O, no failures
```

## Logging Events

```typescript
// Check logs for:
'base_filters_llm_started'
'base_filters_llm_completed'  // or 'failed'
'shared_filters_tightened'
```

## Files

- **LLM**: `server/src/services/search/route2/shared/base-filters-llm.ts`
- **Tighten**: `server/src/services/search/route2/shared/shared-filters.tighten.ts`
- **Types**: `server/src/services/search/route2/shared/shared-filters.types.ts`
- **Orchestrator**: `server/src/services/search/route2/route2.orchestrator.ts` (lines ~192-218)
