# Docker Setup for Pizza Backend

This directory contains everything you need to build and deploy the backend as a Docker container.

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage production-ready Docker image |
| `.dockerignore` | Excludes unnecessary files from build |
| `docker-compose.yml` | Local development with Docker |
| `docker-build-and-push.sh` | Automated build & push script (Linux/Mac) |
| `docker-build-and-push.ps1` | Automated build & push script (Windows) |

---

## 🚀 Quick Start

### Option 1: Local Testing with Docker Compose

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk-your-key-here

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f backend

# Test the API
curl http://localhost:3000/healthz

# Stop the container
docker-compose down
```

### Option 2: Build Manually

```bash
# Build the image (from server directory)
cd server
docker build -t pizza-backend:latest -f Dockerfile ..

# Run the container
docker run -d \
  -p 3000:3000 \
  -e OPENAI_API_KEY=sk-your-key-here \
  -e NODE_ENV=production \
  --name pizza-backend \
  pizza-backend:latest

# Check logs
docker logs -f pizza-backend

# Stop and remove
docker stop pizza-backend
docker rm pizza-backend
```

### Option 3: Automated Build & Push to AWS ECR

**Windows (PowerShell):**
```powershell
cd server
.\docker-build-and-push.ps1 -AwsRegion us-east-1 -EcrRepository pizza-backend -ImageTag latest
```

**Linux/Mac (Bash):**
```bash
cd server
chmod +x docker-build-and-push.sh
./docker-build-and-push.sh
```

**With custom parameters:**
```bash
# Set environment variables
export AWS_REGION=us-east-1
export ECR_REPOSITORY=pizza-backend
export IMAGE_TAG=v1.0.0

# Run script
./docker-build-and-push.sh
```

---

## 🏗️ Dockerfile Architecture

The Dockerfile uses a **multi-stage build** for optimization:

### Stage 1: Builder
- Uses Node 24 Alpine (lightweight)
- Installs ALL dependencies (including dev)
- Compiles TypeScript to JavaScript
- Result: Built `dist/` folder

### Stage 2: Production
- Uses Node 24 Alpine (clean slate)
- Installs ONLY production dependencies
- Copies built files from Stage 1
- Creates non-root user for security
- Adds health check
- Result: Optimized production image (~150-200MB)

### Security Features:
✅ Runs as non-root user (nodejs:1001)  
✅ Only production dependencies included  
✅ No source code or tests in final image  
✅ Health check configured  
✅ Minimal attack surface  

---

## 🔧 Environment Variables

Required:
- `NODE_ENV` - Set to `production` (default)
- `PORT` - Server port (default: 3000)
- `OPENAI_API_KEY` - Your OpenAI API key

Optional:
- `LOG_LEVEL` - Logging level (info, debug, error)
- `CORS_ORIGIN` - Allowed CORS origins

**For production:** Store secrets in AWS Secrets Manager, not in Dockerfile!

---

## 📊 Image Details

**Base Image:** `node:24-alpine`  
**Expected Size:** ~150-200 MB  
**Exposed Port:** 3000  
**Health Check:** `GET /healthz` every 30 seconds  
**User:** Non-root (nodejs:1001)  

---

## 🧪 Testing Your Docker Image

### 1. Build locally
```bash
docker build -t pizza-backend:test -f Dockerfile ..
```

### 2. Run and test
```bash
# Start container
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=sk-test \
  --name pizza-test \
  pizza-backend:test

# Test health endpoint
curl http://localhost:3000/healthz
# Expected: "ok"

# Test API endpoints (adjust based on your routes)
curl http://localhost:3000/api/v1/search?q=pizza

# Check logs
docker logs pizza-test

# Cleanup
docker stop pizza-test
docker rm pizza-test
```

### 3. Test health check
```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' pizza-test
# Expected: "healthy" (after ~10 seconds)
```

---

## 🐛 Troubleshooting

### Issue: Build fails with "Cannot find module"

**Cause:** Missing shared API files  
**Fix:**
```bash
# Make sure to build from parent directory context
cd server
docker build -t pizza-backend -f Dockerfile ..
# Note the ".." at the end - this is important!
```

### Issue: Container starts but immediately exits

**Cause:** Missing environment variables  
**Fix:**
```bash
# Check logs
docker logs pizza-backend

# Add required env vars
docker run -e OPENAI_API_KEY=sk-xxx -e NODE_ENV=production ...
```

### Issue: Health check failing

**Cause:** Server not responding on port 3000  
**Fix:**
```bash
# Check if server is running inside container
docker exec pizza-backend curl http://localhost:3000/healthz

# Check server logs
docker logs pizza-backend

# Verify port mapping
docker port pizza-backend
```

### Issue: "Permission denied" errors

**Cause:** File permissions  
**Fix:** The Dockerfile already sets correct ownership. If issues persist:
```bash
# Rebuild without cache
docker build --no-cache -t pizza-backend -f Dockerfile ..
```

### Issue: Large image size (>500MB)

**Cause:** Multi-stage build not working  
**Fix:**
```bash
# Check if .dockerignore exists
ls -la .dockerignore

# Verify multi-stage build
docker build -t pizza-backend -f Dockerfile .. --progress=plain

# Clean up old builds
docker system prune -a
```

---

## 📦 Docker Compose Services

The `docker-compose.yml` includes:

### Backend Service
- **Port:** 3000:3000
- **Health Check:** Automatic
- **Restart Policy:** unless-stopped
- **Network:** pizza-network (bridge)
- **Volumes:** ./logs (for log persistence)

### Future Services (Optional)
You can add to `docker-compose.yml`:
```yaml
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - pizza-network

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: pizza
      POSTGRES_USER: pizza
      POSTGRES_PASSWORD: changeme
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - pizza-network

volumes:
  postgres_data:
```

---

## 🚢 Deployment to AWS ECS

After building and pushing to ECR, update your ECS task definition:

```json
{
  "family": "pizza-backend-task",
  "containerDefinitions": [
    {
      "name": "pizza-backend",
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/pizza-backend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        }
      ],
      "secrets": [
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxxxx:secret:pizza-app/openai-key"
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/healthz || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

---

## 📝 Best Practices

1. **Always use specific tags** (not just `latest`) for production:
   ```bash
   docker build -t pizza-backend:v1.2.3
   ```

2. **Scan for vulnerabilities**:
   ```bash
   docker scan pizza-backend:latest
   ```

3. **Keep base images updated**:
   ```bash
   docker pull node:24-alpine
   docker build --no-cache -t pizza-backend:latest -f Dockerfile ..
   ```

4. **Monitor image size**:
   ```bash
   docker images pizza-backend
   ```

5. **Use BuildKit for faster builds**:
   ```bash
   DOCKER_BUILDKIT=1 docker build -t pizza-backend -f Dockerfile ..
   ```

---

## 🔗 Related Documentation

- **Main Deployment Guide:** [../docs/AWS_DEPLOYMENT_GUIDE.md](../docs/AWS_DEPLOYMENT_GUIDE.md)
- **Quick Reference:** [../docs/AWS_DEPLOYMENT_QUICK_REFERENCE.md](../docs/AWS_DEPLOYMENT_QUICK_REFERENCE.md)
- **Architecture Diagrams:** [../docs/AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md](../docs/AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md)

---

## ✅ Pre-Deployment Checklist

- [ ] Dockerfile builds successfully
- [ ] `.dockerignore` is configured
- [ ] Health check endpoint works (`/healthz`)
- [ ] Environment variables documented
- [ ] Image size is reasonable (<300MB)
- [ ] Security scan passed
- [ ] Local container runs successfully
- [ ] Image pushed to ECR
- [ ] ECS task definition updated

---

**Questions?** See troubleshooting section or check the main deployment guide.

**Ready to deploy?** Run the build script and follow the AWS deployment guide!
