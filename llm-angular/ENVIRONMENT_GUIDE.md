# Environment Configuration Guide

## 🌍 Available Environments

Your app now supports 3 environments with automatic API URL switching:

| Environment | API URL | Usage |
|-------------|---------|-------|
| **Local** | `http://localhost:3000` | Default development |
| **Dev** | `http://food-alb-1712335919.eu-north-1.elb.amazonaws.com` | AWS development server |
| **Prod** | `https://api.yourdomain.com` | Production (TODO: Update URL) |

---

## 🚀 How to Use

### Local Development (Default)
```bash
npm start
# or
npm run local
```
**API:** http://localhost:3000/api/v1

### Dev Environment (AWS)
```bash
npm run dev
```
**API:** http://food-alb-1712335919.eu-north-1.elb.amazonaws.com/api/v1

### Production Build
```bash
npm run build
# or
npm run build:prod
```
**API:** https://api.yourdomain.com/api/v1 *(Update in environment.production.ts)*

---

## 📝 Configuration Files

All environment files are in `src/environments/`:

```
src/environments/
├── environment.ts              # Local (default)
├── environment.development.ts  # Dev (AWS)
└── environment.production.ts   # Production
```

### Environment Structure

```typescript
export const environment = {
  production: boolean,      // Is production mode
  apiUrl: string,          // Base API URL (without /api/v1)
  apiBasePath: string,     // API path (/api/v1)
  environmentName: string  // Display name
};
```

---

## 🔧 Adding New Environment Variables

1. Add the variable to **all** environment files:

```typescript
// environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  apiBasePath: '/api/v1',
  environmentName: 'local',
  featureFlags: {           // ← New variable
    enableNewFeature: true
  }
};
```

2. Use it in your code:

```typescript
import { environment } from '../environments/environment';

if (environment.featureFlags.enableNewFeature) {
  // ...
}
```

---

## 🎨 Environment Indicator

The console will show which environment you're using:

```
🌍 API Environment: DEV
[API Config] ✅ Initialized: {
  environment: 'dev',
  apiUrl: 'http://food-alb-1712335919.eu-north-1.elb.amazonaws.com',
  fullBase: 'http://food-alb-1712335919.eu-north-1.elb.amazonaws.com/api/v1',
  endpointCount: 10
}
```

---

## ⚠️ Important Notes

1. **Never commit sensitive data** (API keys, passwords) to environment files
2. **Production URL needs updating** - Edit `environment.production.ts` when you have a domain
3. **CORS settings** - Make sure your backend allows the frontend origin
4. **Local backend** - Run `npm start` in the `server/` folder for local development

---

## 🧪 Testing Different Environments

```bash
# Test local
npm start

# Test dev (AWS)
npm run dev

# Test production build locally
npm run build
cd dist/llm-angular/browser
python -m http.server 4200
```

---

## 📦 Available NPM Scripts

All scripts are already configured in `package.json`:

```bash
npm start        # Local development (default)
npm run local    # Same as start (explicit)
npm run dev      # AWS development environment
npm run prod     # Production mode (serve)

npm run build       # Production build
npm run build:dev   # Development build
npm run build:prod  # Production build (same as build)
```

---

## 🔐 Backend CORS Configuration

Make sure your backend (`server/src/app.ts`) allows the frontend origin:

```typescript
// For local development
app.use(cors({
  origin: 'http://localhost:4200'
}));

// For AWS dev
app.use(cors({
  origin: [
    'http://localhost:4200',
    'http://your-cloudfront-url'
  ]
}));
```

---

**Ready to go! Run `npm run dev` to test AWS! 🎉**
