## Server (Node/Express)

### Highlights

- TypeScript, Express 5, ESM
- Config via environment variables
- Build outputs to `dist/server/src/` (multi-root structure)

### Prerequisites

- Node.js 18+ and npm
- OPENAI_API_KEY in your environment (or .env)

### Quick start (development)

```bash
cd server
npm install
npm run dev
```

- Default URL: `http://localhost:3000`

### Production run

```bash
cd server
npm install
npm run build  # Compiles TS → dist/server/src/ + verifies output
npm start      # Runs: node dist/server/src/server.js
```

**Note**: Build verification runs automatically after `npm run build` to ensure `dist/server/src/server.js` exists.

### Docker build

```bash
# From repository root
docker build -f server/Dockerfile -t food-backend .
```

**Runtime entrypoint**: `node dist/server/src/server.js`

### Environment variables

**Required**:
- `OPENAI_API_KEY` - OpenAI API key for LLM features
- `GOOGLE_API_KEY` - Google Places API key

**Optional**:
- `PORT` (default: 3000)
- `NODE_ENV` (default: development)
- `REDIS_URL` - Redis connection string (e.g., `redis://localhost:6379`)
- `WS_ALLOWED_ORIGINS` - WebSocket CORS origins (comma-separated)

### .env example

```
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
PORT=3000
NODE_ENV=development
REDIS_URL=redis://localhost:6379
WS_ALLOWED_ORIGINS=http://localhost:4200
```

