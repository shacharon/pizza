# DIAGNOSIS: 400 oneOf not permitted

## The Problem

**textsearch.mapper.ts calls:**
```typescript
llmProvider.completeJSON(
  messages,
  TextSearchMappingSchema,  // ← ZOD SCHEMA (has bias: LocationBiasSchema.nullable())
  { stage: 'textsearch_mapper' },
  TEXTSEARCH_JSON_SCHEMA    // ← STATIC SCHEMA (no bias field)
)
```

**In openai.provider.ts completeJSON:**
```typescript
async completeJSON<T extends z.ZodTypeAny>(
  messages: Message[],
  schema: T,              // ← TextSearchMappingSchema (Zod with bias)
  opts?: {...},
  staticJsonSchema?: any  // ← TEXTSEARCH_JSON_SCHEMA (static, no bias)
)
```

**Then on lines 100-109:**
```typescript
if (staticJsonSchema) {
    // Use provided static schema (preferred for critical paths)
    jsonSchema = staticJsonSchema;  // ← Uses static (NO BIAS)
} else {
    // Convert Zod schema to JSON Schema for OpenAI Structured Outputs
    jsonSchema = zodToJsonSchema(schema as any, {
        target: 'openApi3',
        $refStrategy: 'none'
    }) as any;  // ← Would convert Zod (WITH BIAS)
}
```

## Root Cause

The `staticJsonSchema` parameter is correctly passed and used, BUT:

1. **The Zod schema `TextSearchMappingSchema` still has `bias: LocationBiasSchema.nullable()`**
2. **This Zod schema is used for `.parse()` validation AFTER the LLM returns**
3. **Since LLM returns NO `bias` field (schema doesn't have it), Zod validation FAILS**

## The Real Problem

Line 55 in `schemas.ts`:
```typescript
export const TextSearchMappingSchema = z.object({
  providerMethod: z.literal('textSearch'),
  textQuery: z.string().min(1),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  bias: LocationBiasSchema.nullable(),  // ← PROBLEM: Zod expects this field
  reason: z.string().min(1)
}).strict();
```

But `TEXTSEARCH_JSON_SCHEMA` (static) does NOT have `bias`, so LLM returns:
```json
{
  "providerMethod": "textSearch",
  "textQuery": "...",
  "region": "IL",
  "language": "he",
  "reason": "..."
  // NO bias field
}
```

Then Zod parse fails because it expects `bias`.

## Solution

**Option 1**: Make `bias` optional in Zod schema
```typescript
bias: LocationBiasSchema.nullable().optional(),
```

**Option 2**: Create a separate Zod schema for LLM response (no bias)
```typescript
const TextSearchLLMResponseSchema = z.object({
  providerMethod: z.literal('textSearch'),
  textQuery: z.string().min(1),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1)
}).strict();
```

And use that for completeJSON, not `TextSearchMappingSchema`.
