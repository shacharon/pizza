# Environment Configuration Guide

## 🌍 Available Environments

Your app now supports 3 environments with automatic API URL switching:

| Environment | API URL | Usage |
|-------------|---------|-------|
| **Local** | `http://localhost:3000` | Default development |
| **Dev** | `https://api.going2eat.food` | AWS development server |
| **Prod** | `https://api.going2eat.food` | Production |

---

## 🚀 How to Use

### Local Development (Default) - Port 4200
```bash
npm start
# or
npm run local
```
**API:** http://localhost:3000/api/v1  
**Frontend:** http://localhost:4200

### AWS Dev Environment - Port 4201
```bash
npm run aws
# or
npm run dev
```
**API:** https://api.going2eat.food/api/v1  
**Frontend:** http://localhost:4201

### Production Build
```bash
npm run build
# or
npm run build:prod
```
**API:** https://api.going2eat.food/api/v1

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
  apiUrl: 'https://api.going2eat.food',
  fullBase: 'https://api.going2eat.food/api/v1',
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

## 🧪 Testing Both Environments Simultaneously

**Open 2 terminals:**

**Terminal 1 - Local Backend:**
```bash
cd C:\dev\piza\angular-piza\llm-angular
npm start
```
Opens: http://localhost:4200 → Connects to `localhost:3000`

**Terminal 2 - AWS Backend:**
```bash
cd C:\dev\piza\angular-piza\llm-angular
npm run aws
```
Opens: http://localhost:4201 → Connects to AWS ALB

**Now you can test both side-by-side!** 🎉

---

## 📦 Available NPM Scripts

All scripts are already configured in `package.json`:

```bash
# Run Both Simultaneously:
npm start        # Local backend (port 4200)
npm run aws      # AWS backend (port 4201)

# Alternative Commands:
npm run local    # Same as start
npm run dev      # Same as aws

# Production:
npm run prod     # Production mode

# Builds:
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
