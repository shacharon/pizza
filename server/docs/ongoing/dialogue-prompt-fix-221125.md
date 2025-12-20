# Dialogue Prompt Fix - Nov 22, 2025

## Problem

LLM was returning invalid JSON:
- `suggestions` as strings instead of objects
- `shouldSearch` missing (undefined)
- Schema validation failing

**Root Cause:** Prompt was too long and complex. LLM got confused by "wisdom of crowds" section and didn't follow schema strictly.

---

## Solution

### Phase 1: MVP (Implemented Now) ✅

**Simplified Single-Call Prompt:**
- Shorter (50% reduction)
- Explicit JSON example in prompt
- Clear rules: "suggestions MUST be array of objects"
- Removed verbose sections
- Kept wisdom of crowds insights but condensed

**Key Changes:**
1. Added concrete JSON example showing exact format
2. Added explicit rules section
3. Simplified context presentation
4. Removed long emoji guide
5. Removed verbose examples section

### Phase 2: Advanced Flow (Prepared for Later) 🔄

**Two-Call Architecture:**
- Call 1: Analyze intent (creative, no schema)
- Call 2: Format response (strict schema)
- Feature flag to switch between modes

---

## Code Changes

### 1. Added Feature Flag

```typescript
export class DialogueService {
  private readonly useAdvancedFlow = false; // Set to true to enable two-call
  // ...
}
```

### 2. Split Response Generation

```typescript
// Router method
if (this.useAdvancedFlow) {
  llmResponse = await this.generateResponseTwoCall(context, userMessage);
} else {
  llmResponse = await this.generateResponseSingleCall(context, userMessage);
}
```

### 3. Simplified Prompt (Single-Call)

**Before (300+ lines):**
```
You are a savvy, street-smart food search assistant...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WISDOM OF THE CROWDS...
[Long section with patterns]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR RESPONSE STRUCTURE...
[Detailed guidelines]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES...
[Multiple examples]
```

**After (50 lines):**
```
You are a friendly food search assistant.

CONTEXT:
[Concise context]

WISDOM OF CROWDS:
- "date" → parking, wine, romantic
- "quick lunch" → budget, fast, takeout

YOUR TASK:
[4 clear points]

CRITICAL: Return ONLY valid JSON. Follow this EXACT format:
{
  "text": "...",
  "suggestions": [
    {"id":"parking","emoji":"🅿️","label":"Parking","action":"filter","value":"parking"}
  ],
  "shouldSearch": true,
  "filters": ["pizza"]
}

RULES:
- suggestions MUST be array of objects (not strings!)
- shouldSearch MUST be boolean
```

### 4. Added Two-Call Stub

```typescript
private async generateResponseTwoCall(
  context: DialogueContext,
  userMessage: string
): Promise<DialogueResponse> {
  // Call 1: Analyze (creative)
  const analysis = await this.llm.complete(..., { temperature: 0.7 });
  
  // Call 2: Format (strict)
  const response = await this.llm.completeJSON(..., { temperature: 0.0 });
  
  return response;
}
```

---

## Benefits

### Single-Call (MVP)
- ✅ Faster (1 LLM call, ~3 seconds)
- ✅ Cheaper (1 call = $0.001)
- ✅ Simpler code
- ✅ Clear JSON example prevents schema errors

### Two-Call (Future)
- ✅ More reliable (separate thinking from formatting)
- ✅ Better reasoning (creative analysis first)
- ✅ Easier debugging (see intermediate step)
- ✅ Can be A/B tested against single-call

---

## Testing

### Expected Behavior Now

**Input:**
```json
{
  "text": "pizza for a date in tel aviv"
}
```

**Expected Output:**
```json
{
  "message": "Found 15 pizza spots in Tel Aviv! 🍕 Any specific vibe?",
  "suggestions": [
    {"id":"parking","emoji":"🅿️","label":"Parking","action":"filter","value":"parking"},
    {"id":"romantic","emoji":"🌹","label":"Romantic","action":"filter","value":"romantic"},
    {"id":"wine","emoji":"🍷","label":"Wine","action":"filter","value":"wine"},
    {"id":"outdoor","emoji":"🌟","label":"Outdoor","action":"filter","value":"outdoor"}
  ],
  "places": [...],
  "meta": {...}
}
```

**Key Checks:**
- ✅ `suggestions` is array of objects (not strings!)
- ✅ `shouldSearch` is boolean
- ✅ LLM detected "date" context
- ✅ Suggested parking, wine, romantic (wisdom of crowds)

---

## Next Steps

### Immediate (Test MVP)
1. Test with Postman
2. Verify schema validation passes
3. Check if suggestions are smart and contextual
4. Measure success rate

### Future (Phase 2)
1. If schema errors persist → enable two-call flow
2. A/B test: single vs two-call
3. Measure: accuracy, latency, cost
4. Keep best approach or make it configurable

---

## Feature Flag Usage

### Enable Two-Call Flow

```typescript
// In dialogue.service.ts
private readonly useAdvancedFlow = true; // Change to true
```

### Monitor Performance

```typescript
// Add metrics
const t0 = Date.now();
const response = await this.generateResponse(...);
console.log(`[DialogueService] ${this.useAdvancedFlow ? 'Two-call' : 'Single-call'} took ${Date.now() - t0}ms`);
```

---

## Status

✅ **MVP Implemented - Ready for Testing**

- Single-call prompt simplified
- Two-call flow stubbed out
- Feature flag added
- Ready to test with Postman

**Test now and see if schema validation passes!** 🧪


