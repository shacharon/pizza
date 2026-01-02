# API Versioning Migration Guide

## Overview

All API routes are now available under the versioned namespace `/api/v1`.

### Current State: Dual-Mount
- ✅ **Canonical**: `/api/v1/*` (recommended)
- ⚠️ **Legacy**: `/api/*` (temporary, will be deprecated)

Both endpoints work identically - no functional differences.

---

## Migration Path

### Timeline
- **Now**: `/api/v1` available, `/api` remains functional with deprecation headers
- **+3 months**: Deprecation warnings added to documentation
- **+6 months**: `/api` sunset date (removal planned)

### Action Required
**All clients should migrate to `/api/v1` within the next 6 months.**

---

## URL Changes

### Before (Legacy)
```
POST   /api/search
GET    /api/search/stats
POST   /api/analytics/events
GET    /api/analytics/events
GET    /api/analytics/stats
DELETE /api/analytics/events
POST   /api/chat
POST   /api/restaurants/search
POST   /api/nlu/parse
POST   /api/chat/conversation
POST   /api/food/dialogue
POST   /api/places/search
POST   /api/dialogue
DELETE /api/dialogue/session/:sessionId
GET    /api/dialogue/stats
```

### After (Canonical)
```
POST   /api/v1/search
GET    /api/v1/search/stats
POST   /api/v1/analytics/events
GET    /api/v1/analytics/events
GET    /api/v1/analytics/stats
DELETE /api/v1/analytics/events
POST   /api/v1/chat
POST   /api/v1/restaurants/search
POST   /api/v1/nlu/parse
POST   /api/v1/chat/conversation
POST   /api/v1/food/dialogue
POST   /api/v1/places/search
POST   /api/v1/dialogue
DELETE /api/v1/dialogue/session/:sessionId
GET    /api/v1/dialogue/stats
```

**Pattern**: Add `/v1` after `/api` → `/api/v1`

---

## Response Format

**No changes to response schemas.**

Both `/api/*` and `/api/v1/*` return identical responses:

```json
{
  "results": [...],
  "meta": {...}
}
```

---

## Deprecation Headers

Legacy `/api/*` endpoints return these headers:

```http
Deprecation: true
Sunset: Sun, 01 Jun 2025 00:00:00 GMT
Link: </api/v1>; rel="alternate"
```

Use these headers to detect usage programmatically.

---

## Client-Side Migration

### TypeScript/JavaScript

**Before:**
```typescript
const response = await fetch('/api/search', {
  method: 'POST',
  body: JSON.stringify({ query: 'pizza' })
});
```

**After:**
```typescript
// Option 1: Direct update
const response = await fetch('/api/v1/search', {
  method: 'POST',
  body: JSON.stringify({ query: 'pizza' })
});

// Option 2: Centralized config (recommended)
const API_BASE = '/api/v1';
const response = await fetch(`${API_BASE}/search`, {
  method: 'POST',
  body: JSON.stringify({ query: 'pizza' })
});
```

### Angular Service

**Before:**
```typescript
@Injectable()
export class SearchService {
  search(query: string) {
    return this.http.post('/api/search', { query });
  }
}
```

**After:**
```typescript
@Injectable()
export class SearchService {
  private readonly API_V1 = '/api/v1';
  
  search(query: string) {
    return this.http.post(`${this.API_V1}/search`, { query });
  }
}
```

---

## Observability

### Legacy Usage Detection

All requests to `/api/*` are logged with:
```json
{
  "level": "warn",
  "msg": "Legacy API usage (/api) - migrate to /api/v1",
  "path": "/search",
  "method": "POST",
  "userAgent": "Mozilla/5.0..."
}
```

Use these logs to:
1. Identify clients still using legacy endpoints
2. Track migration progress
3. Plan deprecation timeline

### Monitoring Query
```sql
-- CloudWatch Insights
fields @timestamp, path, method, userAgent
| filter msg like /Legacy API usage/
| stats count() by path, userAgent
```

---

## Benefits

1. **Future-proof**: Easy to introduce `/api/v2` without breaking v1 clients
2. **Safe evolution**: Breaking changes isolated to new versions
3. **Gradual migration**: No forced immediate updates
4. **Clear deprecation**: Explicit timeline for removing legacy endpoints

---

## FAQ

### Q: Do I need to update immediately?
**A**: No, but it's recommended. Legacy endpoints work until the sunset date.

### Q: Will response formats change?
**A**: No changes in v1. Response schemas are stable.

### Q: Can I use both `/api` and `/api/v1` during migration?
**A**: Yes, they work identically during the transition period.

### Q: What happens after the sunset date?
**A**: `/api/*` will return `404 Not Found`. Only `/api/v1/*` will work.

### Q: How do I know if I'm still using legacy endpoints?
**A**: Check server logs for "Legacy API usage" warnings, or test your endpoints.

---

## Support

Questions? Open an issue or contact the backend team.
