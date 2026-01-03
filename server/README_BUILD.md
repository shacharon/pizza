# Build Workflow

## 🎯 Recommended Workflow

Always follow this order to catch errors early:

### 1️⃣ Pre-Build Check (Locally)
```powershell
# Windows
cd server
.\check-build.ps1

# Linux/Mac
cd server
chmod +x check-build.sh
./check-build.sh
```

This will:
- ✅ Clean old builds
- ✅ Install dependencies (like Docker does)
- ✅ Run TypeScript compilation
- ✅ Verify build output
- ✅ Check Docker availability

### 2️⃣ Build Docker Image (If checks pass)
```powershell
# From repository root
docker build -f .\server\Dockerfile -t food-backend .
```

### 3️⃣ Test Locally
```powershell
docker run -d -p 3000:3000 -e OPENAI_API_KEY=sk-xxx --name test food-backend
curl http://localhost:3000/healthz
docker logs test
docker stop test && docker rm test
```

### 4️⃣ Push to AWS (If tests pass)
```powershell
# Windows
.\server\docker-build-and-push.ps1

# Linux/Mac
./server/docker-build-and-push.sh
```

---

## 🚀 Quick Commands

### Full Check + Build + Test
```powershell
# Check everything first
cd server
.\check-build.ps1

# If passed, build Docker
cd ..
docker build -f .\server\Dockerfile -t food-backend .

# Test it
docker run -d -p 3000:3000 -e OPENAI_API_KEY=sk-test --name test food-backend
Start-Sleep -Seconds 5
curl http://localhost:3000/healthz
docker stop test && docker rm test
```

### Just Build (Skip checks - not recommended)
```powershell
cd angular-piza  # repo root
docker build -f .\server\Dockerfile -t food-backend .
```

---

## 🔍 What the Pre-Build Checker Does

The checker script (`check-build.ps1` / `check-build.sh`) simulates what Docker will do:

```
1. Clean Environment
   ├─ Delete node_modules/
   └─ Delete dist/

2. Install Dependencies
   ├─ npm ci (server)
   └─ npm install (shared)

3. TypeScript Build
   ├─ npm run build
   └─ Verify dist/server/src/server.js exists

4. Linting (optional)
   └─ npm run lint

5. Docker Check
   ├─ Docker installed?
   └─ Docker running?
```

**Why?** This catches errors in **30 seconds** instead of waiting **5 minutes** for Docker to fail!

---

## 🐛 Common Errors and Fixes

### Error: "TypeScript compilation failed"
```powershell
# See full error output
cd server
npm run build

# Common causes:
# - Missing import
# - Type mismatch
# - File excluded by tsconfig.json
```

### Error: "Entry point NOT found"
```powershell
# Check your tsconfig.json paths
cd server
cat tsconfig.json

# Should have:
# "rootDir": ".."
# "outDir": "./dist"
```

### Error: "Docker not running"
```powershell
# Windows: Start Docker Desktop
# Linux: sudo systemctl start docker
# Mac: Open Docker.app
```

### Error: "Module not found '@api/...'"
```powershell
# Install shared dependencies
cd shared
npm install --legacy-peer-deps
```

---

## 📝 Add to Git Pre-Commit Hook (Optional)

To automatically run checks before every commit:

```bash
# .git/hooks/pre-commit
#!/bin/bash
cd server
./check-build.sh
```

---

## 💡 Pro Tips

1. **Always run the checker first**
   - Saves time (30s vs 5min Docker build)
   - Catches errors early
   - Cleaner build logs

2. **Keep dependencies in sync**
   - Commit `package-lock.json`
   - Run `npm ci` not `npm install` in CI/CD
   - Shared folder needs `zod` dependency

3. **Verify before pushing**
   ```powershell
   .\server\check-build.ps1  # Local check
   docker build ...           # Docker check
   docker run ...             # Runtime check
   # Only then push to AWS
   ```

4. **Watch for excluded files**
   - Check `tsconfig.json` exclude patterns
   - QA and test files shouldn't be in production build
   - Use `**/qa/**` and `**/orchestrator/**` patterns

---

## 🎓 Understanding the Build

```
Source Code (TypeScript)
    ↓
check-build.ps1 (Optional but recommended)
    ├─ npm ci --legacy-peer-deps
    ├─ npm run build (tsc)
    └─ Verify dist/ exists
    ↓ (if passed)
Docker Build
    ├─ Stage 1: Builder
    │   ├─ npm ci
    │   ├─ npm run build
    │   └─ Output: dist/
    └─ Stage 2: Production
        ├─ npm ci --omit=dev
        └─ COPY dist/ from Stage 1
    ↓
Docker Image (Ready to run)
    └─ node dist/server/src/server.js
```

---

## ✅ Checklist Before Building

- [ ] Ran `check-build.ps1` / `check-build.sh`
- [ ] All checks passed (green checkmarks)
- [ ] Committed latest changes to git
- [ ] Verified `shared/package.json` has `zod`
- [ ] Docker Desktop is running
- [ ] Have AWS credentials configured (if pushing to ECR)

---

**Save time: Run the checker first! ⚡**
