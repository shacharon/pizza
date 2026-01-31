# Order Badge - Before/After JSON Examples

## Before Fix ❌

### Early Exit Response (CLARIFY)
```json
{
  "requestId": "req-1769842782697-xwtoh8dtp",
  "sessionId": "sess-123",
  "query": {
    "original": "מה לאכול",
    "parsed": {...},
    "language": "he"
  },
  "results": [],
  "chips": [],
  "assist": {
    "type": "clarify",
    "message": "Where are you looking?"
  },
  "meta": {
    "tookMs": 150,
    "mode": "textsearch",
    "appliedFilters": [],
    "confidence": 0.5,
    "source": "route2_generic_query_guard",
    "failureReason": "LOW_CONFIDENCE"
    // ❌ MISSING: order field
  }
}
```

**UI Result**: Order badge hidden (orderProfile() returns null)

---

### Success Response (With Results)
```json
{
  "requestId": "req-1769842782697-xwtoh8dtp",
  "sessionId": "sess-123",
  "query": {
    "original": "restaurants in Tel Aviv",
    "parsed": {...},
    "language": "en"
  },
  "results": [
    { "id": "r1", "name": "Restaurant 1", ... },
    { "id": "r2", "name": "Restaurant 2", ... }
  ],
  "chips": [],
  "assist": {
    "type": "guide",
    "message": ""
  },
  "meta": {
    "tookMs": 850,
    "mode": "textsearch",
    "appliedFilters": [],
    "confidence": 0.95,
    "source": "route2",
    "failureReason": "NONE",
    "pagination": {
      "shownNow": 10,
      "totalPool": 10,
      "offset": 0,
      "hasMore": false
    },
    "order": {
      "profile": "balanced",
      "weights": {
        "rating": 25,
        "reviews": 20,
        "price": 15,
        "openNow": 15,
        "distance": 25
      }
    }
  }
}
```

**UI Result**: Order badge visible ✅

---

## After Fix ✅

### Early Exit Response (CLARIFY)
```json
{
  "requestId": "req-1769842782697-xwtoh8dtp",
  "sessionId": "sess-123",
  "query": {
    "original": "מה לאכול",
    "parsed": {...},
    "language": "he"
  },
  "results": [],
  "chips": [],
  "assist": {
    "type": "clarify",
    "message": "Where are you looking?"
  },
  "meta": {
    "tookMs": 150,
    "mode": "textsearch",
    "appliedFilters": [],
    "confidence": 0.5,
    "source": "route2_generic_query_guard",
    "failureReason": "LOW_CONFIDENCE",
    // ✅ ALWAYS PRESENT: order field
    "order": {
      "profile": "balanced",
      "weights": {
        "rating": 25,
        "reviews": 20,
        "price": 15,
        "openNow": 15,
        "distance": 25
      }
    }
  }
}
```

**UI Result**: Order badge renders (even for early exit, though results are empty)

---

### Success Response - Balanced Profile
```json
{
  "requestId": "req-1769842782697-xwtoh8dtp",
  "sessionId": "sess-123",
  "query": {
    "original": "restaurants in Tel Aviv",
    "parsed": {...},
    "language": "en"
  },
  "results": [
    { "id": "r1", "name": "Restaurant 1", ... },
    { "id": "r2", "name": "Restaurant 2", ... },
    { "id": "r3", "name": "Restaurant 3", ... }
  ],
  "chips": [],
  "assist": {
    "type": "guide",
    "message": ""
  },
  "meta": {
    "tookMs": 850,
    "mode": "textsearch",
    "appliedFilters": [],
    "confidence": 0.95,
    "source": "route2",
    "failureReason": "NONE",
    "pagination": {
      "shownNow": 10,
      "totalPool": 10,
      "offset": 0,
      "hasMore": false
    },
    // ✅ ALWAYS PRESENT: order field
    "order": {
      "profile": "balanced",
      "weights": {
        "rating": 25,
        "reviews": 20,
        "price": 15,
        "openNow": 15,
        "distance": 25
      }
    }
  }
}
```

**UI Rendering**:
```
┌─────────────────────────────────────┐
│ Order: Balanced                     │
│ ⭐ 25% 💬 20% 📍 25% 💰 15% 🟢 15%  │
└─────────────────────────────────────┘
```

---

### Success Response - Nearby Profile
```json
{
  "requestId": "req-abc",
  "sessionId": "sess-123",
  "query": {
    "original": "restaurants open now near me",
    "parsed": {...},
    "language": "en"
  },
  "results": [...],
  "meta": {
    "tookMs": 920,
    "mode": "nearbysearch",
    "confidence": 0.9,
    "failureReason": "NONE",
    // ✅ Computed from intent (openNow=true)
    "order": {
      "profile": "nearby",
      "weights": {
        "rating": 15,
        "reviews": 10,
        "price": 10,
        "openNow": 25,
        "distance": 40
      }
    }
  }
}
```

**UI Rendering**:
```
┌─────────────────────────────────────┐
│ Order: Nearby                       │
│ 📍 40% 🟢 25% ⭐ 15% 💬 10% 💰 10%  │
└─────────────────────────────────────┘
```

---

### Success Response - Quality Profile
```json
{
  "requestId": "req-def",
  "sessionId": "sess-123",
  "query": {
    "original": "best recommended restaurants in Tel Aviv",
    "parsed": {...},
    "language": "en"
  },
  "results": [...],
  "meta": {
    "tookMs": 1100,
    "mode": "textsearch",
    "confidence": 0.92,
    "failureReason": "NONE",
    // ✅ Computed from intent (quality keywords)
    "order": {
      "profile": "quality",
      "weights": {
        "rating": 35,
        "reviews": 30,
        "price": 10,
        "openNow": 10,
        "distance": 15
      }
    }
  }
}
```

**UI Rendering**:
```
┌─────────────────────────────────────┐
│ Order: Quality                      │
│ ⭐ 35% 💬 30% 📍 15% 💰 10% 🟢 10%  │
└─────────────────────────────────────┘
```

---

### Success Response - Budget Profile
```json
{
  "requestId": "req-ghi",
  "sessionId": "sess-123",
  "query": {
    "original": "cheap restaurants",
    "parsed": {...},
    "language": "en"
  },
  "results": [...],
  "meta": {
    "tookMs": 780,
    "mode": "textsearch",
    "confidence": 0.88,
    "failureReason": "NONE",
    // ✅ Computed from intent (priceIntent='cheap')
    "order": {
      "profile": "budget",
      "weights": {
        "rating": 15,
        "reviews": 15,
        "price": 35,
        "openNow": 15,
        "distance": 20
      }
    }
  }
}
```

**UI Rendering**:
```
┌─────────────────────────────────────┐
│ Order: Budget                       │
│ 💰 35% 📍 20% ⭐ 15% 💬 15% 🟢 15%  │
└─────────────────────────────────────┘
```

---

## Log Events (Backend)

### New Log Event 1: Response Order Check
```json
{
  "level": "info",
  "requestId": "req-123",
  "event": "response_order_check",
  "hasOrder": true,
  "orderProfile": "balanced",
  "resultCount": 10,
  "msg": "[ORDER] Response order metadata check before send"
}
```

### New Log Event 2: Early Exit Order Check
```json
{
  "level": "info",
  "requestId": "req-456",
  "event": "early_exit_response_order_check",
  "hasOrder": true,
  "orderProfile": "balanced",
  "failureReason": "LOW_CONFIDENCE",
  "msg": "[ORDER] Early exit response order metadata check"
}
```

### Existing Log Event: Order Profile Resolved
```json
{
  "level": "info",
  "requestId": "req-789",
  "event": "order_profile_resolved",
  "profile": "nearby",
  "weights": {
    "rating": 15,
    "reviews": 10,
    "price": 10,
    "openNow": 25,
    "distance": 40
  },
  "hasUserLocation": true,
  "openNowRequested": true,
  "msg": "[ORDER] Deterministic order profile resolved"
}
```

---

## Summary

**Before**: Order badge missing, inconsistent across response types  
**After**: Order badge always present, consistent JSON structure

**Key Changes**:
1. Backend: Added `meta.order` to all responses (including early exits)
2. Frontend: Removed `@if` gating, always render badge
3. Safety: Fallback to "Balanced" + default weights if somehow missing

**Visual Impact**:
```
Before: [No badge visible]
After:  ┌─────────────────────────────┐
        │ Order: Balanced             │
        │ ⭐ 25% 💬 20% 📍 25% ...    │
        └─────────────────────────────┘
```

**Result**: ✅ Transparent ranking strategy always visible to users
