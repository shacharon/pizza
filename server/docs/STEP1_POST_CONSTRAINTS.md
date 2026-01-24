# ✅ Step 1 Complete: Post-Constraints Types & Prompt

## Files Created

### 1. `server/src/services/search/route2/shared/post-constraints.types.ts`

**Purpose**: Type definitions and Zod schemas for post-Google constraints

**Exports**:
- ✅ `OpenStateSchema` - Zod enum for temporal states
- ✅ `OpenAtSchema` - Zod schema for "open at specific time"
- ✅ `OpenBetweenSchema` - Zod schema for "open between X-Y"
- ✅ `PriceLevelSchema` - Zod union for 1-4 price levels
- ✅ `RequirementsSchema` - Zod schema for accessibility/parking
- ✅ `PostConstraintsSchema` - Combined Zod schema
- ✅ `PostConstraints` - TypeScript type (inferred from schema)
- ✅ `buildDefaultPostConstraints()` - Helper returning all-null defaults

**Schema Structure**:
```typescript
{
  openState: "OPEN_NOW"|"CLOSED_NOW"|"OPEN_AT"|"OPEN_BETWEEN"|null,
  openAt: { day: 0-6|null, timeHHmm: "HH:mm"|null } | null,
  openBetween: { day: 0-6|null, startHHmm: "HH:mm"|null, endHHmm: "HH:mm"|null } | null,
  priceLevel: 1|2|3|4|null,
  isKosher: boolean|null,
  requirements: { accessible: boolean|null, parking: boolean|null }
}
```

---

### 2. `server/src/services/search/route2/prompts/post-constraints.prompt.ts`

**Purpose**: LLM system prompt for extracting post-constraints

**Exports**:
- ✅ `POST_CONSTRAINTS_PROMPT_VERSION` - Version string
- ✅ `POST_CONSTRAINTS_SYSTEM_PROMPT` - Detailed extraction rules
- ✅ `POST_CONSTRAINTS_JSON_SCHEMA` - Static JSON schema for OpenAI
- ✅ `POST_CONSTRAINTS_SCHEMA_HASH` - Schema hash for observability
- ✅ `POST_CONSTRAINTS_PROMPT_HASH` - Prompt hash for versioning

**Key Features**:
- ✅ Does NOT output location, language, region, or confidence
- ✅ Outputs ONLY constraint fields
- ✅ Comprehensive examples (Hebrew + English)
- ✅ Detailed field definitions with all edge cases
- ✅ Uses `anyOf` for null-or-value fields (OpenAI strict mode compatible)

**Example Prompts & Outputs**:

#### Example 1: "פתוחות עכשיו"
```json
{
  "openState": "OPEN_NOW",
  "openAt": null,
  "openBetween": null,
  "priceLevel": null,
  "isKosher": null,
  "requirements": {"accessible": null, "parking": null}
}
```

#### Example 2: "cheap kosher pizza"
```json
{
  "openState": null,
  "openAt": null,
  "openBetween": null,
  "priceLevel": 1,
  "isKosher": true,
  "requirements": {"accessible": null, "parking": null}
}
```

#### Example 3: "נגישה עם חניה פתוחה ב-20:00"
```json
{
  "openState": "OPEN_AT",
  "openAt": {"day": null, "timeHHmm": "20:00"},
  "openBetween": null,
  "priceLevel": null,
  "isKosher": null,
  "requirements": {"accessible": true, "parking": true}
}
```

---

## Build Status

✅ **TypeScript compilation passes**
✅ **No linter errors**
✅ **All Zod schemas valid**
✅ **JSON schema compatible with OpenAI strict mode**

---

## Usage (for Step 2)

```typescript
import { PostConstraintsSchema, buildDefaultPostConstraints } from './shared/post-constraints.types.js';
import { 
  POST_CONSTRAINTS_SYSTEM_PROMPT, 
  POST_CONSTRAINTS_JSON_SCHEMA,
  POST_CONSTRAINTS_SCHEMA_HASH 
} from './prompts/post-constraints.prompt.js';

// LLM call example
const response = await llmProvider.completeJSON(
  [
    { role: 'system', content: POST_CONSTRAINTS_SYSTEM_PROMPT },
    { role: 'user', content: userQuery }
  ],
  PostConstraintsSchema,  // Zod validation
  { stage: 'post_constraints', timeout: 3000 },
  POST_CONSTRAINTS_JSON_SCHEMA  // Static JSON schema for OpenAI
);

// Default (all-null)
const defaults = buildDefaultPostConstraints();
```

---

## Design Decisions

### 1. **anyOf Instead of nullable()**
```typescript
// Used: anyOf [null, type]
openState: {
  anyOf: [
    { type: "null" },
    { type: "string", enum: [...] }
  ]
}

// Avoided: nullable() which produces oneOf
// Reason: OpenAI strict mode doesn't support oneOf/allOf
```

### 2. **All Fields Required**
- Every field is `required` in JSON schema
- Fields can be `null`, but must be present
- LLM MUST output all fields (prevents partial responses)

### 3. **No Location/Language Fields**
- Prompt explicitly states: "NEVER output location, language, region, or confidence"
- Focus only on post-Google constraints

### 4. **Hebrew + English Examples**
- Covers both major languages
- Clear mapping rules (e.g., "זול" → priceLevel: 1)

---

## Next Steps (Step 2)

1. Create LLM service function `extractPostConstraints(query: string)`
2. Wire into Route2 orchestrator (parallel with base-filters-llm)
3. Store in context for post-filters to use
4. Update post-filters to consume new constraints

---

## Validation

### Test Schema Parsing
```typescript
import { PostConstraintsSchema } from './shared/post-constraints.types.js';

// Valid
const result1 = PostConstraintsSchema.parse({
  openState: "OPEN_NOW",
  openAt: null,
  openBetween: null,
  priceLevel: null,
  isKosher: null,
  requirements: { accessible: null, parking: null }
});

// Valid with values
const result2 = PostConstraintsSchema.parse({
  openState: "OPEN_AT",
  openAt: { day: 5, timeHHmm: "19:00" },
  openBetween: null,
  priceLevel: 2,
  isKosher: true,
  requirements: { accessible: true, parking: null }
});

// Invalid (missing field) - throws ZodError
PostConstraintsSchema.parse({
  openState: "OPEN_NOW"
  // Missing other fields
});
```

### Test Helper
```typescript
import { buildDefaultPostConstraints } from './shared/post-constraints.types.js';

const defaults = buildDefaultPostConstraints();
// {
//   openState: null,
//   openAt: null,
//   openBetween: null,
//   priceLevel: null,
//   isKosher: null,
//   requirements: { accessible: null, parking: null }
// }
```

---

## File Locations

```
server/src/services/search/route2/
├── shared/
│   └── post-constraints.types.ts  ← NEW
└── prompts/
    └── post-constraints.prompt.ts  ← NEW
```
