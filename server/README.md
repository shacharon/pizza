## Server (Node/Express)

### Highlights

- TypeScript, Express 5, ESM
- Config via environment variables

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
npm run build
npm start
```

### Environment variables

- `OPENAI_API_KEY` (required)
- `PORT` (default: 3000)

### .env example

```
OPENAI_API_KEY=sk-...
PORT=3000
```
