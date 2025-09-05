# NLU Implementation Plan

## Overview

Natural Language Understanding (NLU) service that converts user text into structured queries and orchestrates the conversation flow. Uses existing OpenAI infrastructure for slot-filling, then calls Google Places API for results.

## Architecture

```
User Text → NLU Service → Intent Policy → Action
                ↓              ↓         ↓
           Slot Extraction → Decision → Response
                              ↓
                    "search" | "clarify_city" | "clarify_type"
```

## Core Components

### 1. NLU Service (`server/src/services/nlu.service.ts`)

**Purpose**: Extract structured slots from natural language text

**Input**:

```ts
{
  text: "I want pizza in Tel Aviv under 60 shekels",
  language: "he" | "en" | "ar"
}
```

**Output**:

```ts
{
  slots: {
    city?: string;
    type?: "pizza" | "sushi" | "burger" | "other";
    maxPrice?: number;
    language: string;
  },
  confidence: number; // 0-1
}
```

**Implementation**: Uses existing `OpenAiProvider.completeJSON()` with temperature=0 for consistent slot extraction.

### 2. Intent Policy (`server/src/services/nlu.policy.ts`)

**Purpose**: Decide what action to take based on extracted slots

**Logic**:

- **Anchors required**: `city` AND (`type` OR `maxPrice`)
- **If anchors satisfied** → `intent: "search"`
- **If missing city** → `intent: "clarify_city"`
- **If missing type/price** → `intent: "clarify_type"`

**Output**:

```ts
{
  intent: "search" | "clarify_city" | "clarify_type";
  action: "fetch_results" | "ask_clarification";
  message?: string; // clarification prompt
}
```

### 3. NLU Controller (`server/src/controllers/nlu.controller.ts`)

**Purpose**: Orchestrate the full NLU → Action flow

**Endpoint**: `POST /api/nlu/parse`

**Flow**:

1. Extract slots via NLU service
2. Apply intent policy
3. If `action: "fetch_results"` → call existing `/api/restaurants/search`
4. If `action: "ask_clarification"` → return prompt
5. Return unified response

**Response Types**:

```ts
// Success with results
{
  type: "results";
  query: FoodQueryDTO;
  restaurants: Restaurant[];
  meta: { source: "google", cached: boolean, ... };
}

// Clarification needed
{
  type: "clarify";
  message: string;
  missing: ("city" | "type" | "price")[];
  language: string;
}
```

## Conversation Flow Examples

### Example 1: Complete Query

```
Input: "pizza in Tel Aviv under 60"
→ Slots: { city: "Tel Aviv", type: "pizza", maxPrice: 60 }
→ Intent: "search"
→ Action: fetch_results
→ Response: { type: "results", restaurants: [...] }
```

### Example 2: Missing City

```
Input: "I want Italian food"
→ Slots: { type: "other" }
→ Intent: "clarify_city"
→ Action: ask_clarification
→ Response: { type: "clarify", message: "In which city should I search?" }
```

### Example 3: Missing Type/Price

```
Input: "something tasty in Haifa"
→ Slots: { city: "Haifa" }
→ Intent: "clarify_type"
→ Action: ask_clarification
→ Response: { type: "clarify", message: "What kind of food do you prefer — pizza, sushi, burgers, or something else?" }
```

## LLM Prompt Design

### System Prompt (Slot Extraction)

```
You are a food search assistant. Extract structured information from user queries.

Return ONLY valid JSON matching this schema:
{
  "city": string | null,
  "type": "pizza" | "sushi" | "burger" | "other" | null,
  "maxPrice": number | null
}

Rules:
- Extract city names accurately (handle Hebrew/Arabic transliteration)
- Map food types: Italian→pizza, Japanese→sushi, etc.
- Extract price from "under X", "below X", "max X" patterns
- Return null for missing information
- Do not invent or assume information
```

### User Prompt Template

```
Language: {{language}}
User query: "{{text}}"

Extract the food search parameters as JSON.
```

## Implementation Steps

### Phase 1: Core NLU (Current)

1. ✅ Create `nlu.service.ts` with slot extraction
2. ✅ Create `nlu.policy.ts` with intent logic
3. ✅ Create `nlu.controller.ts` with unified endpoint
4. ✅ Add route `POST /api/nlu/parse`

### Phase 2: Frontend Integration

5. Update `FoodFacade` to call `/api/nlu/parse`
6. Handle both response types in UI
7. Test conversation flows

### Phase 3: Enhancements

8. Add conversation context/memory
9. Improve slot extraction accuracy
10. Add more intent types (show_more, refine, etc.)

## Error Handling

### LLM Failures

- Timeout/rate limit → fallback to simple keyword extraction
- Invalid JSON → retry once, then fallback
- Low confidence → ask for clarification

### API Failures

- Google Places error → return graceful error message
- Network issues → retry with exponential backoff

## Testing Strategy

### Unit Tests

- NLU service: various text inputs → expected slots
- Policy: slot combinations → correct intents
- Controller: end-to-end request/response

### Integration Tests

- Full conversation flows
- Multi-language support
- Error scenarios

## Performance Considerations

- **LLM calls**: Cache common patterns, use temperature=0
- **Response time**: Target <2s for NLU+search combined
- **Rate limiting**: Protect against abuse
- **Monitoring**: Track intent accuracy, response times

## Multilingual Support

### Language Detection

- Use existing frontend detection
- Pass language to NLU for context-aware extraction

### Localized Responses

- Clarification messages in user's language
- City name normalization (Hebrew ↔ English)
- Cultural food type mapping

---

## Next Steps

Starting with **Phase 1, Step 1**: Create `nlu.service.ts` with slot extraction using existing OpenAI infrastructure.
