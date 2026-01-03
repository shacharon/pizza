# Dockerfile Explanation

## Build Context

**Build context is the repository root** (the parent directory of `server/`).

```
angular-piza/              ← BUILD CONTEXT (.)
├── server/
│   ├── Dockerfile         ← Dockerfile location
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   └── server.ts
│   └── dist/              ← Build output (after compilation)
│       └── server/
│           └── src/
│               └── server.js
├── shared/
│   └── api/               ← Shared TypeScript code
└── tsconfig.base.json
```

## Why Build Context = Repo Root?

The TypeScript configuration has:
```json
{
  "compilerOptions": {
    "rootDir": "..",        // Compiles from repo root
    "outDir": "./dist"      // Outputs to server/dist/
  },
  "include": [
    "src/**/*.ts",
    "../shared/api/**/*.ts" // Includes shared code
  ]
}
```

This means the compiler needs access to **both** `server/` and `shared/` directories, which only works when the build context is the repo root.

## How to Build Locally

### From Repository Root:

```bash
# Navigate to repo root
cd /path/to/angular-piza

# Build the image
docker build -f server/Dockerfile -t pizza-backend:latest .
#                    ↑                                    ↑
#              Dockerfile path                      Build context (.)

# Run the container
docker run -d \
  -p 3000:3000 \
  -e OPENAI_API_KEY=sk-your-key \
  --name pizza-backend \
  pizza-backend:latest

# Test health endpoint
curl http://localhost:3000/healthz
```

### Alternative (from server/ directory):

```bash
# Navigate to server directory
cd /path/to/angular-piza/server

# Build with parent context
docker build -f Dockerfile -t pizza-backend:latest ..
#                                                 ↑↑
#                                    Build context = parent dir
```

## Entry Point: Why `dist/server/src/server.js`?

### Source Structure:
```
server/src/server.ts       ← TypeScript source file
```

### TypeScript Compilation:
Because `tsconfig.json` has `"rootDir": ".."`, the compiler preserves the directory structure **from the repo root**:

```
Input:  server/src/server.ts
        shared/api/types.ts

Output: server/dist/server/src/server.js    ← Entry point
        server/dist/shared/api/types.js
```

### Final Container Structure:
```
/app/
├── package.json
├── node_modules/
└── dist/
    ├── server/
    │   └── src/
    │       └── server.js    ← CMD runs this
    └── shared/
        └── api/
            └── types.js
```

### CMD Explanation:
```dockerfile
CMD ["node", "dist/server/src/server.js"]
```

- ✅ **Correct**: Matches the compiled output structure
- ✅ **Production-ready**: No TypeScript compilation at runtime
- ✅ **Deterministic**: Always the same entry point

### Common Mistakes:
```dockerfile
# ❌ WRONG - would look for dist/server.js (doesn't exist)
CMD ["node", "dist/server.js"]

# ❌ WRONG - src/server.ts is TypeScript (needs compilation)
CMD ["node", "src/server.ts"]

# ❌ WRONG - would need ts-node (not installed in production)
CMD ["ts-node", "src/server.ts"]
```

## Multi-Stage Build Breakdown

### Stage 1: Builder (Heavy)
- **Base**: `node:24-alpine` (~200MB)
- **Contains**: All npm packages (prod + dev), TypeScript compiler, source code
- **Purpose**: Compile TypeScript to JavaScript
- **Output**: `server/dist/` directory with compiled `.js` files
- **Discarded**: After build completes, this layer is thrown away

### Stage 2: Production (Lightweight)
- **Base**: Fresh `node:24-alpine` (~200MB)
- **Contains**: Only production npm packages + compiled JS
- **Purpose**: Run the application
- **Size**: ~150-250MB (vs 500MB+ without multi-stage)
- **Security**: No devDependencies, no source code, no compiler

## Build Process Flow

```
1. COPY package*.json         → Install dependencies
2. npm ci                     → All deps (prod + dev)
3. COPY source files          → TypeScript + configs
4. npm run build              → Compile TS → JS
   ├─ Input: server/src/**/*.ts, shared/api/**/*.ts
   └─ Output: server/dist/**/*.js
5. ─────────────────────────────────────────────────
   Start fresh image (Stage 2)
6. COPY package*.json         → Install dependencies
7. npm ci --only=production   → Prod deps only
8. COPY dist from builder     → Only compiled JS
9. CMD node dist/server/src/server.js
```

## Security Features

1. **Non-root user**: Runs as `nodejs:1001` (not root)
2. **Minimal image**: Alpine Linux (smallest possible)
3. **No source code**: Only compiled JavaScript in final image
4. **No devDependencies**: TypeScript, @types, etc. not in production
5. **Health checks**: Automatic restart if unhealthy
6. **No secrets**: Environment variables from AWS Secrets Manager

## Production Optimizations

1. **Layer caching**: `package*.json` copied before source code
   - If code changes but dependencies don't → reuse cached npm install
   
2. **npm ci vs npm install**:
   - `npm ci`: Faster, deterministic, deletes node_modules first
   - Perfect for CI/CD and Docker builds
   
3. **--only=production flag**: Skips devDependencies
   - Saves ~100-200MB in final image
   
4. **npm cache clean**: Removes temporary npm files
   - Saves ~50-100MB in final image

## Troubleshooting

### Issue: "Cannot find module '@api/...'"

**Cause**: Shared code not copied to builder stage

**Fix**: Already handled - Dockerfile copies `shared/` directory

---

### Issue: "Error: Cannot find module 'dist/server.js'"

**Cause**: Wrong CMD path

**Fix**: Already correct - uses `dist/server/src/server.js`

---

### Issue: Build fails with "Cannot find tsconfig.json"

**Cause**: Wrong build context

**Fix**: Build from repo root with `docker build -f server/Dockerfile .`

---

### Issue: Image size > 500MB

**Cause**: Multi-stage build not working or devDependencies included

**Fix**: 
- Verify `--only=production` flag in Stage 2
- Check that Stage 2 has `FROM node:24-alpine` (not `FROM builder`)

---

### Issue: Health check failing

**Cause**: `/healthz` endpoint not responding

**Fix**:
1. Check logs: `docker logs pizza-backend`
2. Verify server started: `docker exec pizza-backend curl http://localhost:3000/healthz`
3. Check environment variables are set

## AWS ECS Deployment

This Dockerfile is optimized for AWS ECS Fargate:

```json
{
  "family": "pizza-backend-task",
  "containerDefinitions": [{
    "name": "pizza-backend",
    "image": "<AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/pizza-backend:latest",
    "memory": 1024,
    "cpu": 512,
    "essential": true,
    "portMappings": [{
      "containerPort": 3000,
      "protocol": "tcp"
    }],
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:3000/healthz || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 60
    },
    "secrets": [{
      "name": "OPENAI_API_KEY",
      "valueFrom": "arn:aws:secretsmanager:..."
    }]
  }]
}
```

## Verification Checklist

After building, verify:

- [ ] Image size < 300MB: `docker images pizza-backend`
- [ ] Non-root user: `docker run pizza-backend id` (should show uid=1001)
- [ ] Health check works: `docker inspect pizza-backend | grep Health`
- [ ] Logs visible: `docker logs pizza-backend`
- [ ] Port exposed: `docker port pizza-backend`
- [ ] Environment set: `docker exec pizza-backend env | grep NODE_ENV`

## Quick Commands Reference

```bash
# Build
docker build -f server/Dockerfile -t pizza-backend:latest .

# Run locally
docker run -d -p 3000:3000 -e OPENAI_API_KEY=sk-xxx --name test pizza-backend

# Test
curl http://localhost:3000/healthz

# View logs
docker logs -f test

# Check health
docker inspect test --format='{{.State.Health.Status}}'

# Cleanup
docker stop test && docker rm test

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
docker tag pizza-backend:latest <ECR_URI>:latest
docker push <ECR_URI>:latest
```

---

**Summary**: This Dockerfile uses a multi-stage build with the repo root as context, compiles TypeScript including shared code, and produces a secure, minimal production image that runs `dist/server/src/server.js` as the entry point.
