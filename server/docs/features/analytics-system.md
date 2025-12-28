# Analytics System

**Status:** ✅ Implemented  
**Storage:** In-Memory (1000 events)  
**Date:** December 21, 2025

---

## Overview

Lightweight analytics system for tracking user events in the unified search experience. Uses **in-memory storage** (no database required) to track the last 1000 events.

---

## Endpoints

### POST /api/analytics/events
Track an analytics event.

**Request:**
```json
{
  "event": "search_submitted",
  "data": {
    "query": "italian restaurant in tel aviv",
    "sessionId": "session-123",
    "timestamp": "2025-12-21T17:00:00.000Z"
  }
}
```

**Response:**
```json
{
  "received": true,
  "stored": 42
}
```

---

### GET /api/analytics/events
Query recent events (for debugging).

**Query Parameters:**
- `limit` (optional): Number of events to return (default: 100)
- `event` (optional): Filter by event type

**Example:**
```bash
GET /api/analytics/events?limit=50&event=search_submitted
```

**Response:**
```json
{
  "total": 150,
  "limit": 50,
  "events": [
    {
      "event": "search_submitted",
      "data": { "query": "pizza", "count": 12 },
      "timestamp": "2025-12-21T17:00:00.000Z"
    }
  ]
}
```

---

### GET /api/analytics/stats
Get analytics statistics.

**Response:**
```json
{
  "totalEvents": 150,
  "maxCapacity": 1000,
  "eventTypes": {
    "search_submitted": 45,
    "results_rendered": 45,
    "action_executed": 30,
    "timing": 30
  },
  "oldestEvent": "2025-12-21T15:00:00.000Z",
  "newestEvent": "2025-12-21T17:00:00.000Z"
}
```

---

### DELETE /api/analytics/events
Clear all stored events (for testing).

**Response:**
```json
{
  "cleared": 150,
  "message": "All events cleared"
}
```

---

## Event Types

The frontend tracks these events:

| Event | Description | Data |
|-------|-------------|------|
| `search_submitted` | User submitted a search | `query`, `sessionId` |
| `results_rendered` | Results displayed | `count`, `query`, `tookMs` |
| `search_failed` | Search error occurred | `error`, `query` |
| `action_executing` | User clicked an action | `type`, `level`, `restaurantId` |
| `action_executed` | Action completed | `type`, `level`, `restaurantId` |
| `action_failed` | Action failed | `type`, `error` |
| `timing` | Performance measurement | `label`, `durationMs` |
| `error` | General error | `message`, `stack` |

---

## Storage Details

**Type:** In-Memory Array  
**Capacity:** 1000 events (FIFO)  
**Persistence:** ❌ Lost on server restart  
**Performance:** < 1ms per event

**Why In-Memory?**
- ✅ No database setup required
- ✅ Fast (<1ms)
- ✅ Good enough for development/beta
- ✅ Easy to query for debugging
- ✅ Automatic cleanup (max 1000 events)

**Future Enhancement:**
When you need persistent storage, upgrade to:
- PostgreSQL (for analytics dashboard)
- Redis (for real-time monitoring)
- External service (Mixpanel, Amplitude, etc.)

---

## Usage Example

### From Frontend (Angular)

```typescript
// Already implemented in AnalyticsService
this.analyticsService.track('search_submitted', {
  query: 'pizza',
  sessionId: 'session-123'
});
```

### From Backend (Manual)

```bash
# PowerShell
Invoke-WebRequest -Uri "http://localhost:3000/api/analytics/events" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"event":"custom_event","data":{"foo":"bar"}}'
```

---

## Debug Dashboard

To view recent analytics in your browser, you can query the endpoints:

```bash
# View last 100 events
http://localhost:3000/api/analytics/events?limit=100

# View stats
http://localhost:3000/api/analytics/stats

# Filter by event type
http://localhost:3000/api/analytics/events?event=search_submitted
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `server/src/controllers/analytics/analytics.controller.ts` | Backend controller |
| `server/src/app.ts` | Route registration |
| `llm-angular/src/app/services/analytics.service.ts` | Frontend service |

---

## Testing

```bash
# Test POST
Invoke-WebRequest -Uri "http://localhost:3000/api/analytics/events" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"event":"test","data":{"message":"hello"}}'

# Test GET
Invoke-WebRequest -Uri "http://localhost:3000/api/analytics/stats" | Select-Object -ExpandProperty Content
```

---

## Performance Impact

**Latency:** < 1ms per event  
**Memory:** ~100KB for 1000 events  
**Network:** Fire-and-forget (non-blocking)

**No impact on search performance!** ✅

---

## Next Steps (Future)

When you need permanent storage:

1. **Add PostgreSQL table:**
```sql
CREATE TABLE analytics_events (
  id SERIAL PRIMARY KEY,
  event VARCHAR(100),
  data JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

2. **Update controller** to write to DB instead of memory

3. **Build dashboard** with charts (event counts, latency trends, etc.)

4. **Add retention policy** (delete events older than 30 days)

---

**Status:** ✅ Production-ready for beta testing  
**Next:** Ship to internal users and monitor!










