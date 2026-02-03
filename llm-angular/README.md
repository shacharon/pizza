## Frontend (Angular)

### Highlights

- Angular 19, Standalone components
- Jest for unit tests (user preference)
- **🚀 Unified Search (In Progress)**: Migrating to `/api/search` with Human-in-the-Loop actions

### Prerequisites

- Node.js 18+ and npm

### Quick start (development)

```bash
cd llm-angular
npm install
npm start
```

- Default URL: `http://localhost:4200` (proxied API via `proxy.conf.json`)

### Build for production

```bash
cd llm-angular
npm run build:prod
```

**Note**: Production builds include the service worker for PWA support.

### Progressive Web App (PWA)

The Angular app is now a Progressive Web App with offline support and installability.

**Features:**

- ✅ Installable on desktop and mobile
- ✅ Offline app shell (navigation works offline)
- ✅ Service worker caching (app files only, NOT API data)
- ✅ Fast load times with aggressive caching
- ✅ Icons and manifest for all platforms

**Testing PWA locally:**

```bash
# Build production
npm run build:prod

# Serve with HTTPS (required for service worker)
cd dist/llm-angular/browser
npx http-server -p 8080

# Then test in Chrome (localhost is treated as secure)
# Open: http://localhost:8080
```

**Chrome DevTools verification:**

1. Open DevTools → Application tab
2. Check Service Workers: Should show `ngsw-worker.js` as "activated and running"
3. Check Manifest: Should show "Piza Search" with icons
4. Check Cache Storage: Should see `ngsw:llm-angular:cache:app`
5. Test offline: Network tab → Check "Offline" → Refresh (app shell should load)

**Important**: API calls are NOT cached. Only the app shell (HTML/JS/CSS) is cached. Search results always come from the server.

For deployment headers configuration, see: `../docs/pwa-hosting-headers.md`

### Testing (Jest)

```bash
cd llm-angular
npm test
```

---

## 🚀 Unified Search Migration (Dec 2025)

We are migrating from legacy food search endpoints to a unified `/api/search` endpoint with an action-based Human-in-the-Loop pattern.

### Current Status

**Phase 1: Documentation** ✅ In Progress (90%)

- [x] Architecture Decision Record (ADR-001)
- [x] Migration status tracking document
- [x] UI/UX specification
- [x] README update

### What's New

**Unified Search Page:**

- Single `/api/search` endpoint (replaces 3 legacy endpoints)
- Faster response times (target: <5s vs 10-13s)
- Multilingual consistency (6 languages)
- Human-in-the-Loop action pattern (L0/L1/L2 levels)

**Action Proposals:**

- **L0 (Read-only)**: Get directions, Call, View details, Share
- **L1 (Local)**: Save to favorites (localStorage)
- **L2 (Future)**: Book table, Place order (requires backend approval)

### Routes

| Route             | Status          | Description                   |
| ----------------- | --------------- | ----------------------------- |
| `/search-preview` | 🟢 Dev only     | Always accessible for testing |
| `/search`         | 🟡 Feature flag | Gated by `unifiedSearch` flag |
| `/food/grid`      | 🟢 Legacy       | Current default (stable)      |
| `/dialogue`       | 🟢 Legacy       | Conversational search         |

### Feature Flag

Enable the new search experience:

```typescript
// In browser console or via admin panel
localStorage.setItem("ff_unifiedSearch", "true");
location.reload();
```

Disable:

```typescript
localStorage.setItem("ff_unifiedSearch", "false");
location.reload();
```

### Documentation

- **Architecture**: `docs/architecture/adr-001-human-in-loop-search.md`
- **Migration Status**: `docs/ongoing/unified-search-migration-status.md`
- **UI Specification**: `docs/ui-spec-unified-search.md`
- **API Docs**: `../server/docs/api/unified-search-api.md`

### Testing the New Search

1. Start the backend server:

   ```bash
   cd server
   npm run dev
   ```

2. Start the Angular dev server:

   ```bash
   cd llm-angular
   npm start
   ```

3. Navigate to: `http://localhost:4200/search-preview`

4. Try searches in multiple languages:
   - English: "pizza in London"
   - Hebrew: "פיצה באשקלון"
   - French: "pizza à Paris"

### Timeline

| Phase                | Target    | Status     |
| -------------------- | --------- | ---------- |
| 1. Documentation     | Dec 20    | ✅ 90%     |
| 2. Backend updates   | Dec 20    | 🟡 Pending |
| 3. Frontend services | Dec 21 AM | 🟡 Pending |
| 4. Components        | Dec 21 PM | 🟡 Pending |
| 5. Search page       | Dec 22 AM | 🟡 Pending |
| 6. Testing           | Dec 22 PM | 🟡 Pending |
| 7. Rollout           | Dec 23    | 🟡 Pending |
| 8. Docs & cleanup    | Dec 24    | 🟡 Pending |

### Rollback Plan

If issues arise, disable the feature flag instantly:

- No deployment needed
- Users automatically redirect to legacy `/food/grid`
- Fix bugs while users on stable route

### Contributing

See migration status for current tasks:

- `docs/ongoing/unified-search-migration-status.md`

---

## Legacy Commands (Still Valid)

npm run test
npx jest --coverage
npx serve reports -l 5501

npm run start
npx jest-preview --open =>http://localhost:3336
npx jest
