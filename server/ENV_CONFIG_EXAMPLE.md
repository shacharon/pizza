# .env Configuration Example

Copy this to your `.env` file and adjust values as needed.

---

## Minimal Development Setup

```bash
# Node Environment
NODE_ENV=development

# Server Port
PORT=3000

# Frontend Origins (CORS + WebSocket)
FRONTEND_ORIGINS=http://localhost:4200

# API Keys (Required)
OPENAI_API_KEY=sk-your-openai-key-here
GOOGLE_API_KEY=AIza-your-google-key-here

# Redis (Optional for local dev)
ENABLE_REDIS_JOBSTORE=false
ENABLE_REDIS_CACHE=false
REDIS_URL=redis://localhost:6379
```

---

## Production Setup

```bash
# Node Environment
NODE_ENV=production

# Server Port (usually managed by ECS)
PORT=3000

# Frontend Origins (CORS + WebSocket)
# ⚠️  CRITICAL: List all allowed frontend domains (comma-separated)
# No wildcard "*" allowed in production when credentials enabled
FRONTEND_ORIGINS=https://app.going2eat.food,https://www.going2eat.food

# Alternative: Wildcard subdomain (use with caution)
# FRONTEND_ORIGINS=https://*.going2eat.food

# Allow requests without Origin header (default: true)
# Set to false in production to reject missing origins
CORS_ALLOW_NO_ORIGIN=false

# API Keys (Required)
OPENAI_API_KEY=sk-prod-...
GOOGLE_API_KEY=AIza-prod-...

# Redis (Recommended for production)
ENABLE_REDIS_JOBSTORE=true
ENABLE_REDIS_CACHE=true
REDIS_URL=redis://your-elasticache-endpoint:6379
REDIS_CACHE_PREFIX=cache:

# TTLs (Time To Live, in seconds)
REDIS_JOB_TTL_SECONDS=86400
GOOGLE_CACHE_TTL_SECONDS=900

# Intent Cache
CACHE_INTENT=true
INTENT_CACHE_TTL_SECONDS=600
```

---

## Staging Setup

```bash
NODE_ENV=production
PORT=3000

# Use staging domain
FRONTEND_ORIGINS=https://staging.going2eat.food

OPENAI_API_KEY=sk-staging-...
GOOGLE_API_KEY=AIza-staging-...

# Use staging Redis
ENABLE_REDIS_JOBSTORE=true
ENABLE_REDIS_CACHE=true
REDIS_URL=redis://staging-redis:6379
```

---

## Multiple Frontend Origins (Production)

```bash
# Main app + admin panel + mobile web
FRONTEND_ORIGINS=https://app.going2eat.food,https://admin.going2eat.food,https://m.going2eat.food

# With wildcard subdomain (allows any subdomain)
FRONTEND_ORIGINS=https://*.going2eat.food

# Mixed: specific + wildcard
FRONTEND_ORIGINS=https://app.going2eat.food,https://*.going2eat.food
```

---

## Environment-Specific Notes

### Development

- `FRONTEND_ORIGINS` is **optional** (defaults to permissive CORS)
- If not set, WebSocket defaults to `http://localhost:4200`
- Wildcard `*` is allowed
- Missing Origin header is tolerated for localhost

### Production

- `FRONTEND_ORIGINS` is **required** (throws error if missing)
- Wildcard `*` is **forbidden** (throws error if present)
- CORS `credentials: true` (secure cookies)
- WebSocket requires JWT token

---

## Backward Compatibility

These old env variables still work (but are deprecated):

```bash
# Old (deprecated, but still works)
CORS_ALLOWED_ORIGINS=https://app.example.com
ALLOWED_ORIGINS=https://app.example.com

# New (recommended)
FRONTEND_ORIGINS=https://app.example.com
```

---

## ECS Task Definition Example (JSON)

```json
{
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "your-ecr-repo/backend:latest",
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        },
        {
          "name": "FRONTEND_ORIGINS",
          "value": "https://app.going2eat.food,https://www.going2eat.food"
        },
        {
          "name": "ENABLE_REDIS_JOBSTORE",
          "value": "true"
        },
        {
          "name": "ENABLE_REDIS_CACHE",
          "value": "true"
        },
        {
          "name": "REDIS_URL",
          "value": "redis://your-elasticache-endpoint:6379"
        }
      ],
      "secrets": [
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:openai-key"
        },
        {
          "name": "GOOGLE_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:google-key"
        }
      ]
    }
  ]
}
```

---

## Terraform Example (ECS Task Definition)

```hcl
resource "aws_ecs_task_definition" "backend" {
  family = "backend"
  
  container_definitions = jsonencode([
    {
      name  = "backend"
      image = "${aws_ecr_repository.backend.repository_url}:latest"
      
      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "FRONTEND_ORIGINS"
          value = "https://app.going2eat.food,https://www.going2eat.food"
        },
        {
          name  = "ENABLE_REDIS_JOBSTORE"
          value = "true"
        },
        {
          name  = "REDIS_URL"
          value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
        }
      ]
      
      secrets = [
        {
          name      = "OPENAI_API_KEY"
          valueFrom = aws_secretsmanager_secret.openai_key.arn
        },
        {
          name      = "GOOGLE_API_KEY"
          valueFrom = aws_secretsmanager_secret.google_key.arn
        }
      ]
    }
  ])
}
```

---

## Validation

After deploying, check logs for successful initialization:

```bash
# Local
npm run dev
# Look for: [INFO] CORS: Initialized | originsCount=1, originsSummary="http://localhost:4200"

# ECS (CloudWatch Logs)
# Search: "CORS: Initialized"
# Should show: originsCount=2, originsSummary="https://app.going2eat.food, ..."
```

---

## Security Checklist

Production deployment checklist:

- [ ] `FRONTEND_ORIGINS` includes all legitimate frontend domains
- [ ] No wildcard `*` in `FRONTEND_ORIGINS` (unless using `*.domain.com`)
- [ ] `NODE_ENV=production` is set
- [ ] API keys stored in AWS Secrets Manager (not plain text)
- [ ] Redis URL points to ElastiCache (not localhost)
- [ ] Test CORS from allowed origin (should work)
- [ ] Test CORS from blocked origin (should reject)
- [ ] Check CloudWatch Logs for origin rejections
- [ ] Monitor for unexpected `Origin validation: Rejected` logs
