# API Route Inventory - v1

Complete list of all API v1 endpoints.

## Unified Search (Primary)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/search` | Unified search (BFF) | ✅ Active |
| GET | `/api/v1/search/stats` | Orchestrator statistics | ✅ Active |

## Analytics

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/analytics/events` | Track analytics event | ✅ Active |
| GET | `/api/v1/analytics/events` | Query recent events | ✅ Active |
| GET | `/api/v1/analytics/stats` | Get analytics statistics | ✅ Active |
| DELETE | `/api/v1/analytics/events` | Clear all events (dev) | ✅ Active |

## Legacy Chat Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/chat` | Chat endpoint | ⚠️ Deprecated (use /search) |
| POST | `/api/v1/restaurants/search` | Restaurant search | ⚠️ Deprecated (use /search) |
| POST | `/api/v1/nlu/parse` | NLU parser | ⚠️ Deprecated (use /search) |
| POST | `/api/v1/chat/conversation` | Conversation | ⚠️ Deprecated (use /search) |
| POST | `/api/v1/food/dialogue` | Food dialogue | ⚠️ Deprecated (use /dialogue) |

## Legacy Places Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/places/search` | Places search | ⚠️ Deprecated (use /search) |

## Dialogue (Conversational)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/dialogue` | Dialogue endpoint | ✅ Active |
| DELETE | `/api/v1/dialogue/session/:sessionId` | Clear session | ✅ Active |
| GET | `/api/v1/dialogue/stats` | Get dialogue stats | ✅ Active |

## Health Check (Unversioned)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/healthz` | Health check | ✅ Active |

---

## Migration Notes

### Deprecated Endpoints
Routes marked as "Deprecated" still work but clients should migrate:
- `/chat`, `/restaurants/search`, `/nlu/parse` → Use `/search`
- `/places/search` → Use `/search`
- `/food/dialogue` → Use `/dialogue`

### Timeline
- Legacy endpoints under `/api/*` will be removed after sunset date (see migration guide)
- Internal deprecated routes (chat, places, etc.) may be removed in future versions

---

## Testing

All routes can be tested with the same payloads under both `/api/*` (legacy) and `/api/v1/*` (canonical).

Example:
```bash
# Legacy (deprecated)
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza in tel aviv"}'

# Canonical (recommended)
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza in tel aviv"}'
```

Both return identical responses (legacy includes deprecation headers).
