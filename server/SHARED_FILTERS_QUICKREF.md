# Route2 Shared Filters - Quick Reference

## Import

```typescript
// Types
import type { 
  PreGoogleBaseFilters, 
  FinalSharedFilters,
  Route2Context 
} from './route2/types.js';

// Schemas (for validation)
import { 
  PreGoogleBaseFiltersSchema, 
  FinalSharedFiltersSchema 
} from './route2/shared/shared-filters.types.js';
```

## PreGoogleBaseFilters

**Before Google API call**

```typescript
type PreGoogleBaseFilters = {
  language: 'he' | 'en' | 'auto';
  openNow: boolean;
  regionHint?: string;  // 2-char ISO, auto-uppercase
};
```

**Example**:
```typescript
const preFilters: PreGoogleBaseFilters = {
  language: 'auto',
  openNow: true,
  regionHint: 'il'  // → 'IL'
};

// Validate
const validated = PreGoogleBaseFiltersSchema.parse(preFilters);
```

## FinalSharedFilters

**With response to client**

```typescript
type FinalSharedFilters = {
  language: 'he' | 'en';  // No 'auto'
  openNow: boolean;
  regionCode: string;  // Required, 2-char ISO, auto-uppercase
  disclaimers: {
    hours: true;
    dietary: true;
  };
};
```

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

// Validate
const validated = FinalSharedFiltersSchema.parse(finalFilters);
```

## Route2Context

```typescript
interface Route2Context {
  // ... existing fields
  sharedFilters?: {
    preGoogle?: PreGoogleBaseFilters;
    final?: FinalSharedFilters;
  };
}
```

**Usage**:
```typescript
// Set preGoogle early
ctx.sharedFilters = {
  preGoogle: {
    language: 'auto',
    openNow: request.openNow ?? false,
    regionHint: intentResult.region
  }
};

// Set final before response
ctx.sharedFilters.final = {
  language: resolvedLang,
  openNow: ctx.sharedFilters.preGoogle.openNow,
  regionCode: resolvedRegion,
  disclaimers: { hours: true, dietary: true }
};
```

## Validation

```typescript
// Transform + validate
const input = { language: 'en', openNow: true, regionHint: 'fr' };
const validated = PreGoogleBaseFiltersSchema.parse(input);
// validated.regionHint === 'FR' (uppercased)

// Type-safe errors
try {
  PreGoogleBaseFiltersSchema.parse({ language: 'invalid' });
} catch (error) {
  // Zod validation error
}
```

## Flow

```
Request
  ↓
PreGoogleBaseFilters (language: 'auto', regionHint?: 'il')
  ↓
Google API Call
  ↓
Results
  ↓
FinalSharedFilters (language: 'he', regionCode: 'IL', disclaimers)
  ↓
Response
```

## Files

- **Types**: `server/src/services/search/route2/shared/shared-filters.types.ts`
- **Context**: `server/src/services/search/route2/types.ts`
- **Docs**: `server/src/services/search/route2/shared/README.md`
