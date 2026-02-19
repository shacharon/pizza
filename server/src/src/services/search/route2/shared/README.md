# Route2 Shared Filters - Type Contracts

## Overview

Minimal TypeScript contracts for Route2 pipeline filters with Zod validation.

## Types

### PreGoogleBaseFilters

Applied **before** calling Google Places API.

```typescript
{
  language: 'he' | 'en' | 'auto',
  openNow: boolean,
  regionHint?: string  // Optional ISO-3166-1 alpha-2 (uppercase)
}
```

**Characteristics**:
- `language` can be `'auto'` (will be resolved later)
- `regionHint` is optional (will be resolved to `regionCode`)
- Zod schema validates and uppercases `regionHint`

**Example**:
```typescript
const preFilters: PreGoogleBaseFilters = {
  language: 'auto',
  openNow: true,
  regionHint: 'il'  // Will be transformed to 'IL'
};
```

### FinalSharedFilters

Tightened filters passed to client **with** results.

```typescript
{
  language: 'he' | 'en',  // Resolved (no 'auto')
  openNow: boolean,
  regionCode: string,  // Required ISO-3166-1 alpha-2 (uppercase)
  disclaimers: {
    hours: true,
    dietary: true
  }
}
```

**Characteristics**:
- `language` must be resolved (no `'auto'`)
- `regionCode` is **required** and uppercase
- `disclaimers` always present with literal `true` values
- Zod schema validates and uppercases `regionCode`

**Example**:
```typescript
const finalFilters: FinalSharedFilters = {
  language: 'he',
  openNow: true,
  regionCode: 'IL',
  disclaimers: {
    hours: true,
    dietary: true
  }
};
```

## Zod Schemas

Both types have Zod schemas for validation:

```typescript
import { PreGoogleBaseFiltersSchema, FinalSharedFiltersSchema } from './shared/shared-filters.types.js';

// Validate and transform
const validated = PreGoogleBaseFiltersSchema.parse({
  language: 'en',
  openNow: false,
  regionHint: 'fr'  // Will be transformed to 'FR'
});
```

**Validation Features**:
- `regionHint`/`regionCode`: Must be exactly 2 characters, auto-uppercased
- `openNow`: Must be boolean
- `language`: Must be one of allowed enum values
- `disclaimers`: Must have both `hours` and `dietary` set to `true`

## Integration with Route2Context

The filters are wired into `Route2Context`:

```typescript
export interface Route2Context {
  // ... existing fields
  sharedFilters?: {
    preGoogle?: PreGoogleBaseFilters;
    final?: FinalSharedFilters;
  };
}
```

**Usage**:
```typescript
const ctx: Route2Context = {
  // ... other fields
  sharedFilters: {
    preGoogle: {
      language: 'auto',
      openNow: true,
      regionHint: 'IL'
    }
    // final will be populated later in pipeline
  }
};
```

## Files

1. **`server/src/services/search/route2/shared/shared-filters.types.ts`**
   - Type definitions
   - Zod schemas
   - Clean exports

2. **`server/src/services/search/route2/types.ts`**
   - Extended `Route2Context` with `sharedFilters`
   - Re-exports filter types

## Design Principles

✅ **Minimal**: Only essential fields, no extras  
✅ **Type-safe**: Zod schemas for runtime validation  
✅ **Transformative**: Auto-uppercase region codes  
✅ **Progressive**: `PreGoogle` → `Final` tightening  
✅ **Clean**: No orchestrator changes yet  

## Next Steps (Not Implemented)

1. Populate `ctx.sharedFilters.preGoogle` in orchestrator
2. Transform `preGoogle` → `final` before response
3. Include `final` in SearchResponse
4. Add filter application logic in Google stage

## Validation

✅ No TypeScript errors  
✅ No linter errors  
✅ Build passes  
✅ Clean exports  
✅ Zod schemas compile  

**Status**: ✅ **COMPLETE - Ready for orchestrator integration**
