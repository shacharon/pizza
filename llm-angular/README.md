## Frontend (Angular)

### Highlights

- Angular 19, Standalone components
- Jest for unit tests (user preference)

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
npm run build
```

### Testing (Jest)

```bash
cd llm-angular
npm test
```

npm run test
npx jest --coverage
npx serve reports -l 5501

npm run start
npx jest-preview --open =>http://localhost:3336
npx jest
