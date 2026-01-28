# LLM Configuration Module

Centralized LLM model and timeout resolution with SOLID principles.

## Overview

This module provides a single source of truth for LLM model selection and timeout configuration across the application. Instead of hardcoding models and timeouts throughout the codebase, all LLM calls resolve their configuration through a purpose-based system.

## Architecture (SOLID)

### Separation of Concerns

1. **Configuration** (`llm-config.ts`) - Reads environment variables
2. **Resolution** (`llm-resolver.ts`) - Resolves model+timeout for a purpose  
3. **Client** (`llm-client.ts`) - Helper functions for LLM calls
4. **Types** (`llm-purpose.ts`) - Type definitions

### Single Responsibility

Each module has one clear responsibility:
- Config loads and validates env vars
- Resolver applies override logic
- Client provides convenient wrappers
- Types define the domain

## Usage

### Basic Usage

```typescript
import { resolveLLM } from './lib/llm/index.js';

// Resolve model and timeout for a purpose
const { model, timeoutMs } = resolveLLM('gate');

// Use in LLM call
const response = await llmProvider.completeJSON(
  messages,
  schema,
  { model, timeout: timeoutMs, ...otherOpts },
  staticSchema
);
```

### Using Helper Functions

```typescript
import { buildLLMOptions } from './lib/llm/index.js';

// Build complete options object
const llmOpts = buildLLMOptions('assistant', {
  temperature: 0.7,
  requestId,
  traceId,
  sessionId
});

const response = await llmProvider.completeJSON(
  messages,
  schema,
  llmOpts,
  staticSchema
);
```

## Purposes

Five distinct LLM purposes are defined:

| Purpose | Description | Default Timeout | Default Model |
|---------|-------------|-----------------|---------------|
| `gate` | Gate2 stage - fast food/non-food classification | 2500ms | gpt-4o-mini |
| `intent` | Intent stage - route decision (TEXTSEARCH/NEARBY/LANDMARK) | 2500ms | gpt-4o-mini |
| `baseFilters` | Base filters extraction (language, openState, etc.) | 2000ms | gpt-4o-mini |
| `routeMapper` | Route-specific query mapping | 3500ms | gpt-4o-mini |
| `assistant` | Assistant messages - LLM-generated UX guidance | 3000ms | gpt-4o-mini |

## Environment Variables

### Global Defaults

```bash
# Default model for all purposes (falls back to gpt-4o-mini)
LLM_DEFAULT_MODEL=gpt-4o-mini

# Alternative env var (backward compatibility)
OPENAI_MODEL=gpt-4o-mini

# Default timeout for all purposes (falls back to purpose-specific defaults)
LLM_DEFAULT_TIMEOUT_MS=5000
```

### Per-Purpose Overrides

```bash
# Model overrides
GATE_MODEL=gpt-4o
INTENT_MODEL=gpt-4o-mini
BASE_FILTERS_MODEL=gpt-4o-mini
ROUTE_MAPPER_MODEL=gpt-4o
ASSISTANT_MODEL=gpt-4o-mini

# Timeout overrides (in milliseconds)
GATE_TIMEOUT_MS=3000
INTENT_TIMEOUT_MS=2500
BASE_FILTERS_TIMEOUT_MS=2000
ROUTE_MAPPER_TIMEOUT_MS=4000
ASSISTANT_TIMEOUT_MS=5000
```

## Resolution Logic

For each purpose, the resolver applies this precedence:

### Model Resolution
1. Per-purpose override (e.g., `GATE_MODEL`)
2. Global default (`LLM_DEFAULT_MODEL` or `OPENAI_MODEL`)
3. Hardcoded default (`gpt-4o-mini`)

### Timeout Resolution
1. Per-purpose override (e.g., `GATE_TIMEOUT_MS`)
2. Purpose-specific default (see table above)
3. Global default (`LLM_DEFAULT_TIMEOUT_MS`)

## Validation

The resolver validates all configuration:

- **Model**: Must be non-empty string
- **Timeout**: Must be positive number
- **Warnings**: 
  - Timeout > 30s (may cause performance issues)
  - Timeout < 500ms (may frequently timeout)

Invalid values trigger graceful fallbacks:
- Empty model → use default
- Zero/NaN timeout → use purpose default
- Negative timeout → throw error

## Caching

Configuration is loaded once on startup and cached for performance. To clear cache (e.g., in tests):

```typescript
import { clearLLMConfigCache } from './lib/llm/index.js';

clearLLMConfigCache();
```

## Integration

The LLM configuration system is integrated into:

1. **Assistant Messages** (`route2/assistant/assistant-llm.service.ts`)
2. **Gate2 Stage** (`stages/gate2.stage.ts`)
3. **Intent Stage** (`stages/intent/intent.stage.ts`)
4. **Base Filters** (`shared/base-filters-llm.ts`)
5. **Route Mappers** (`stages/route-llm/textsearch.mapper.ts`, `landmark.mapper.ts`)

## Testing

Comprehensive unit tests cover:
- Default configuration
- Per-purpose overrides
- Validation and error handling
- Edge cases (empty strings, NaN, caching)

Run tests:

```bash
cd server
node --test --import tsx src/lib/llm/llm-resolver.test.ts
```

**Test Results**: ✅ 19/19 passing

## Migration Guide

### Before (Hardcoded)

```typescript
const response = await llmProvider.completeJSON(
  messages,
  schema,
  {
    temperature: 0,
    timeout: 2500,  // Hardcoded
    // No model specified - uses provider default
    ...
  },
  staticSchema
);
```

### After (Centralized)

```typescript
import { resolveLLM } from './lib/llm/index.js';

const { model, timeoutMs } = resolveLLM('gate');

const response = await llmProvider.completeJSON(
  messages,
  schema,
  {
    model,           // From config
    temperature: 0,
    timeout: timeoutMs,  // From config
    ...
  },
  staticSchema
);
```

## Benefits

1. **Single Source of Truth** - All model/timeout config in one place
2. **Environment-Driven** - Easy to customize per deployment
3. **Type-Safe** - TypeScript ensures correct purpose usage
4. **Testable** - Config can be mocked/overridden in tests
5. **Validated** - Catches configuration errors early
6. **Backward Compatible** - Respects existing `OPENAI_MODEL` env var
7. **Graceful Fallbacks** - Never crashes on invalid config

## Future Enhancements

- [ ] Add rate limiting per purpose
- [ ] Add cost tracking per purpose
- [ ] Add A/B testing support (multiple models per purpose)
- [ ] Add purpose-specific retry strategies
- [ ] Add observability dashboard for config usage

## References

- Purpose types: `src/lib/llm/llm-purpose.ts`
- Configuration: `src/lib/llm/llm-config.ts`
- Resolution: `src/lib/llm/llm-resolver.ts`
- Client helpers: `src/lib/llm/llm-client.ts`
- Tests: `src/lib/llm/llm-resolver.test.ts`
