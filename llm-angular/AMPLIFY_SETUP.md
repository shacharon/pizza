# AWS Amplify Setup - Ready for Deployment! ✅

## 🎉 What Was Fixed

Your Angular app is now ready for AWS Amplify deployment! Here's what was done:

### ✅ **1. Moved `shared/` into Angular Workspace**
- **From:** `<repo-root>/shared/`
- **To:** `llm-angular/shared/`
- **Why:** Amplify builds from `llm-angular/` directory, so dependencies must be resolvable from there

### ✅ **2. Fixed TypeScript Path Aliases**
Updated `tsconfig.base.json`:
```json
{
  "paths": {
    "@api": ["llm-angular/shared/api/index.ts"],  // ← Fixed!
    "@api/*": ["llm-angular/shared/api/*"]
  }
}
```

### ✅ **3. Added Dependencies**
Updated `llm-angular/package.json`:
```json
{
  "dependencies": {
    "zod": "^3.22.4",      // ← Added (used by shared DTOs)
    "leaflet": "^1.9.4"    // ← Added (used by map component)
  }
}
```

### ✅ **4. Verified Local Build**
```bash
cd llm-angular
npm ci
npm run build
```
**Result:** ✅ Build succeeded!
**Output:** `dist/llm-angular/browser/` with all assets

---

## 📦 Build Output Verified

```
dist/llm-angular/browser/
├── index.html              ✅
├── main-*.js              ✅
├── styles-*.css           ✅
├── polyfills-*.js         ✅
└── media/                 ✅
```

**Bundle Size:** 554.54 kB (147.98 kB gzipped) ✅

---

## 🚀 Next Steps for Amplify

### **1. Create `amplify.yml` (Repo Root)**

Create this file at `C:\dev\piza\angular-piza\amplify.yml`:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd llm-angular
        - node --version
        - npm --version
        - npm ci
    build:
      commands:
        - npm run build:prod
  artifacts:
    baseDirectory: llm-angular/dist/llm-angular/browser
    files:
      - '**/*'
  cache:
    paths:
      - llm-angular/node_modules/**/*
```

**Critical:** Note the `cd llm-angular` and the full path in `baseDirectory`!

---

### **2. Create `.nvmrc` (Repo Root)**

Create `C:\dev\piza\angular-piza\.nvmrc`:

```
20
```

---

### **3. Update `llm-angular/package.json` Engines**

Already done! ✅ (We added zod and leaflet)

Optional - Add node version:
```json
{
  "engines": {
    "node": ">=20 <21",
    "npm": ">=10"
  }
}
```

---

### **4. Push Changes**

Your branch `fix/amplify-shared` is already pushed! ✅

**Merge to main:**
```bash
git checkout main
git merge fix/amplify-shared
git push
```

**Or create PR:**
https://github.com/shacharon/pizza/pull/new/fix/amplify-shared

---

### **5. Configure Amplify in AWS Console**

1. **Create App:**
   - AWS Amplify Console → **New app** → **Host web app**
   - Connect GitHub: `shacharon/pizza`
   - Branch: `main`

2. **Build Settings:**
   - Amplify will auto-detect `amplify.yml` ✅
   - Or manually set:
     - Build command: `npm run build:prod`
     - Output directory: `llm-angular/dist/llm-angular/browser`

3. **Add SPA Rewrite Rule:**
   - Source: `/*`
   - Target: `/index.html`
   - Type: `200 (Rewrite)`

4. **Deploy!**

---

## ⚠️ Important Notes

### **CORS Configuration Required**

Your backend must allow Amplify's origin. After deployment, update `server/src/app.ts`:

```typescript
app.use(cors({
  origin: [
    'http://localhost:4200',                    // Local
    'http://localhost:4201',                    // AWS test
    'https://main.d123456.amplifyapp.com',     // ← Add your Amplify URL
    'https://app.going2eat.food'               // ← Custom domain (when ready)
  ],
  credentials: false
}));
```

---

## 📊 Changes Summary

| File/Folder | Change | Status |
|-------------|--------|--------|
| `shared/` → `llm-angular/shared/` | Moved | ✅ |
| `tsconfig.base.json` | Updated @api paths | ✅ |
| `llm-angular/package.json` | Added zod, leaflet | ✅ |
| `llm-angular/package-lock.json` | Regenerated | ✅ |
| Local build | Verified working | ✅ |
| Git commit | Created | ✅ |
| Git push | Pushed to origin | ✅ |

---

## ✅ Ready for Amplify!

**Your app is now configured correctly for AWS Amplify deployment!**

**No more build errors related to module resolution.** 🎊

---

## 🧪 Final Local Test

Run this one more time to be 100% sure:

```bash
cd C:\dev\piza\angular-piza\llm-angular
rm -rf node_modules dist
npm ci
npm run build:prod
```

If it succeeds → **You're ready for Amplify!** 🚀
