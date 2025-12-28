# Migration Guide: Legacy Endpoints → Unified Search API

**Date:** December 20, 2025  
**Deprecation Notice:** Legacy endpoints will be removed on **June 1, 2026**

---

## Overview

We're consolidating three endpoints into one unified search API:

| Legacy Endpoint | Status | Replacement |
|----------------|--------|-------------|
| `POST /api/places/search` | ⚠️ Deprecated | `POST /api/search` |
| `POST /api/dialogue` | ⚠️ Deprecated | `POST /api/search` |
| `POST /api/chat` | ℹ️ Unchanged | (Different purpose) |

---

## Why Migrate?

### Benefits of Unified API:
1. **Faster:** 3-5s vs 10-13s (60% faster!)
2. **Simpler:** One endpoint for all search needs
3. **Smarter:** Confidence-based micro-assist UI
4. **Multilingual:** Consistent results across languages
5. **Configurable:** All magic numbers externalized
6. **SOLID:** Better architecture, easier to maintain

---

## Migration Steps

### Step 1: Update Your Request Format

#### From `/api/places/search`

**Before:**
```typescript
const response = await fetch('/api/places/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'pizza in paris',
    userLocation: null,
    nearMe: false
  })
});
```

**After:**
```typescript
const response = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'pizza in paris'  // ← renamed from 'text'
    // userLocation is optional, don't send if null
  })
});
```

#### From `/api/dialogue`

**Before:**
```typescript
const response = await fetch('/api/dialogue', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-session-id': sessionId  // ← in header
  },
  body: JSON.stringify({
    text: 'pizza open now',
    userLocation: { lat: 48.8566, lng: 2.3522 }
  })
});
```

**After:**
```typescript
const response = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'pizza open now',        // ← renamed from 'text'
    sessionId: sessionId,            // ← moved to body
    userLocation: { lat: 48.8566, lng: 2.3522 }
  })
});
```

---

### Step 2: Update Response Handling

#### Response Structure Changes

**Before (`/api/places/search`):**
```json
{
  "restaurants": [...],
  "meta": {
    "source": "google",
    "mode": "textsearch",
    "tookMs": 5000,
    "appliedFilters": ["opennow"],
    "suggestedRefinements": [...]
  }
}
```

**After (`/api/search`):**
```json
{
  "sessionId": "search-123",       // ← NEW
  "query": {                        // ← NEW
    "original": "pizza open now",
    "parsed": {...},
    "language": "en"
  },
  "results": [...],                 // ← renamed from 'restaurants'
  "chips": [...],                   // ← renamed from 'suggestedRefinements'
  "assist": {...},                  // ← NEW (optional)
  "meta": {
    "tookMs": 3500,
    "mode": "textsearch",
    "appliedFilters": ["opennow"],
    "confidence": 0.9,              // ← NEW
    "source": "google_places"
  }
}
```

#### Code Changes

**Before:**
```typescript
const data = await response.json();
const restaurants = data.restaurants;
const suggestions = data.meta.suggestedRefinements;
```

**After:**
```typescript
const data = await response.json();
const restaurants = data.results;     // ← renamed
const suggestions = data.chips;       // ← renamed
const sessionId = data.sessionId;     // ← NEW (save for refinements)

// NEW: Handle low confidence
if (data.assist) {
  showAssistUI(data.assist.message, data.assist.suggestedActions);
}
```

---

### Step 3: Handle SessionId

The new API returns a `sessionId` that you should store for conversation continuity.

**Client-Side Code:**
```typescript
class SearchClient {
  private sessionId: string | null = null;

  async search(query: string) {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        sessionId: this.sessionId  // Include if exists
      })
    });

    const data = await response.json();
    
    // Store session ID for next search
    this.sessionId = data.sessionId;
    
    return data;
  }

  clearSession() {
    this.sessionId = null;
  }
}
```

---

### Step 4: Update UI for Micro-Assist

When confidence is low, the API returns an `assist` payload:

```typescript
interface AssistPayload {
  type: 'clarify' | 'confirm' | 'suggest';
  message: string;
  suggestedActions: Array<{
    label: string;
    query: string;
  }>;
}
```

**Example UI Component (React):**
```tsx
function SearchAssist({ assist }: { assist?: AssistPayload }) {
  if (!assist) return null;

  return (
    <div className="assist-card">
      <p>{assist.message}</p>
      <div className="assist-actions">
        {assist.suggestedActions.map(action => (
          <button 
            key={action.label}
            onClick={() => handleSearch(action.query)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Field Mapping

### Request Body

| Legacy Field (`/api/places/search`) | New Field (`/api/search`) | Notes |
|-------------------------------------|---------------------------|-------|
| `text` | `query` | Renamed |
| `sessionId` (header) | `sessionId` (body) | Moved to body |
| `userLocation` | `userLocation` | Unchanged |
| `nearMe` | — | Removed (auto-detected) |
| `browserLanguage` | — | Removed (auto-detected) |
| `schema` | — | Removed (LLM-based) |

### Response Body

| Legacy Field | New Field | Notes |
|-------------|-----------|-------|
| `restaurants` | `results` | Renamed |
| `meta.suggestedRefinements` | `chips` | Renamed & promoted |
| — | `query` | NEW: parsed query details |
| — | `sessionId` | NEW: for continuity |
| — | `assist` | NEW: low-confidence help |
| — | `meta.confidence` | NEW: intent confidence score |

---

## Feature Differences

### New Features in Unified API

1. **Confidence Scoring**
   - Every search has a confidence score (0-1)
   - Low confidence triggers micro-assist UI
   - No need to handle "unclear query" errors

2. **Session Continuity**
   - Automatic conversation context
   - Refinements understand previous searches
   - E.g., "cheaper options" knows what you searched before

3. **Multilingual Consistency**
   - Same results for "pizza" and "פיצה"
   - No translation delays
   - Original city names preserved

4. **Smart Defaults**
   - "open now" auto-applied for time-sensitive queries
   - Radius auto-calculated based on location type
   - No need to specify common filters

### Removed Features

1. **Schema Parameter**
   - Legacy: You could pass a pre-parsed schema
   - New: LLM always parses (more reliable)

2. **Near Me Flag**
   - Legacy: Explicit `nearMe: true`
   - New: Auto-detected from query or user location

3. **Browser Language Parameter**
   - Legacy: Explicit `browserLanguage`
   - New: Auto-detected from query text

---

## Backward Compatibility

### Gradual Migration

You can migrate gradually:

1. **Month 1-2:** Test new endpoint alongside legacy
2. **Month 3-4:** Migrate production traffic in stages
3. **Month 5:** Deprecate legacy endpoints
4. **Month 6:** Remove legacy endpoints

### Feature Flags

```typescript
const USE_NEW_SEARCH_API = process.env.REACT_APP_USE_NEW_SEARCH === 'true';

async function search(query: string) {
  if (USE_NEW_SEARCH_API) {
    return await newSearchClient.search(query);
  } else {
    return await legacySearchClient.search(query);
  }
}
```

---

## Testing Your Migration

### Integration Tests

```typescript
describe('Search API Migration', () => {
  it('should work with legacy query format', async () => {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'pizza in Paris' })
    });

    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.results).toBeDefined();
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.sessionId).toBeDefined();
  });

  it('should handle session continuity', async () => {
    // First search
    const resp1 = await searchAPI({ query: 'pizza in Paris' });
    const sessionId = resp1.sessionId;

    // Refinement
    const resp2 = await searchAPI({
      query: 'cheaper options',
      sessionId
    });

    expect(resp2.results.length).toBeGreaterThan(0);
  });
});
```

---

## Troubleshooting

### Issue: "query is required"

**Problem:** Forgot to rename `text` to `query`

**Solution:**
```diff
- body: JSON.stringify({ text: 'pizza' })
+ body: JSON.stringify({ query: 'pizza' })
```

### Issue: Session not continuing

**Problem:** Not saving/passing `sessionId`

**Solution:**
```typescript
const { sessionId } = await firstSearch();
// Save it!
await refinementSearch({ query: '...', sessionId });
```

### Issue: No results returned

**Problem:** Check `meta.confidence` - might be too low

**Solution:**
```typescript
if (data.meta.confidence < 0.5) {
  // Show assist UI
  showAssist(data.assist);
}
```

---

## Support & Questions

- **API Docs:** `/server/docs/api/unified-search-api.md`
- **Examples:** `/server/tests/places-search-integration.test.ts`
- **Slack:** #backend-api
- **Email:** backend-team@example.com

---

## Timeline

| Date | Milestone |
|------|-----------|
| Dec 20, 2025 | ✅ New API launched |
| Jan 1, 2026 | ⚠️ Deprecation warnings added |
| Mar 1, 2026 | 📧 Migration reminders sent |
| May 1, 2026 | 🚨 Final warning (30 days) |
| Jun 1, 2026 | 🗑️ Legacy endpoints removed |

---

**Don't wait until the last minute! Migrate today and enjoy the performance boost! 🚀**













