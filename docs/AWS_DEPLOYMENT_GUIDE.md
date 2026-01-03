# AWS Deployment Guide - Pizza Ordering System

**Document Version:** 1.0  
**Last Updated:** January 3, 2026  
**Target Platform:** AWS (ECS + S3 + CloudFront)

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Decision: ECS vs Lambda](#architecture-decision-ecs-vs-lambda)
3. [Deployment Architecture](#deployment-architecture)
4. [Prerequisites](#prerequisites)
5. [Deployment Steps](#deployment-steps)
6. [Cost Estimation](#cost-estimation)
7. [Environment Variables](#environment-variables)
8. [Monitoring & Logging](#monitoring--logging)
9. [Rollback Strategy](#rollback-strategy)
10. [Post-Deployment Checklist](#post-deployment-checklist)

---

## 🎯 System Overview

### Application Components

**Frontend:**
- Angular 19 standalone application
- Build output: Static files (HTML, CSS, JS)
- Deployment target: S3 + CloudFront CDN

**Backend:**
- Node.js 24 + TypeScript (ESM)
- Express 5.1 server
- LLM integration (OpenAI/Langchain)
- In-memory session and cache management
- RESTful API endpoints

### Current State
- ✅ Local development working
- ✅ BitBucket CI pipeline configured
- 🔄 First-time AWS deployment

---

## 🤔 Architecture Decision: ECS vs Lambda

### Why We Chose **AWS ECS with Fargate**

| Criteria | ECS (Fargate) | Lambda | Decision |
|----------|--------------|--------|----------|
| **Server Type** | Long-running Express server | Event-driven functions | ✅ ECS - Our app is designed to run continuously |
| **Cold Starts** | Always warm | 1-3 second delays | ✅ ECS - Better user experience |
| **Execution Time** | Unlimited | 15 min max | ✅ ECS - LLM calls can be long |
| **State Management** | In-memory state persists | Stateless | ✅ ECS - We use `inMemorySessionAgent` |
| **WebSockets** | Native support | Limited | ✅ ECS - Future-proof for real-time features |
| **Cost (low traffic)** | ~$30/month | Pay per request | ⚠️ Lambda wins for very low usage |
| **Complexity** | Moderate (Docker) | High (requires refactor) | ✅ ECS - Less code changes |

**Verdict:** ECS/Fargate is the right choice for our architecture.

---

## 🏗️ Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Internet                              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         AWS Route 53 (DNS)              │
        │     pizza-app.example.com               │
        └─────────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│   CloudFront     │      │  Application     │
│   (CDN)          │      │  Load Balancer   │
│                  │      │  (ALB)           │
│  Static Assets   │      │                  │
└──────────────────┘      └──────────────────┘
          │                         │
          ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│   S3 Bucket      │      │   ECS Fargate    │
│                  │      │   Cluster        │
│  - index.html    │      │                  │
│  - *.js          │      │  ┌────────────┐  │
│  - *.css         │      │  │  Task 1    │  │
│  - assets/       │      │  │  (0.5 CPU) │  │
│                  │      │  │  (1GB RAM) │  │
└──────────────────┘      │  └────────────┘  │
                          │  ┌────────────┐  │
                          │  │  Task 2    │  │
                          │  │  (backup)  │  │
                          │  └────────────┘  │
                          └──────────────────┘
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                          ▼                   ▼
                  ┌──────────────┐   ┌──────────────┐
                  │  CloudWatch  │   │   Secrets    │
                  │  Logs        │   │   Manager    │
                  └──────────────┘   └──────────────┘
```

### Architecture Layers

1. **DNS Layer (Route 53):**
   - Manages domain routing
   - Health checks
   - Failover support

2. **Content Delivery (CloudFront + S3):**
   - Serves Angular frontend globally
   - HTTPS/SSL termination
   - Caching for performance
   - Gzip compression

3. **API Layer (ALB + ECS):**
   - Application Load Balancer routes API traffic
   - ECS Fargate runs containerized Node.js backend
   - Auto-scaling based on CPU/Memory
   - Health checks every 30 seconds

4. **Container (Docker):**
   - Node.js 24 base image
   - Express server (port 3000)
   - Environment variables from Secrets Manager

5. **Monitoring (CloudWatch):**
   - Application logs
   - Performance metrics
   - Alarms for failures

---

## ✅ Prerequisites

### Required Tools
- [ ] AWS Account with billing enabled
- [ ] AWS CLI installed and configured (`aws configure`)
- [ ] Docker Desktop installed
- [ ] Node.js 24+ installed
- [ ] Git repository access

### Required Credentials
- [ ] AWS Access Key ID
- [ ] AWS Secret Access Key
- [ ] OpenAI API Key (for LLM features)
- [ ] Domain name (optional, can use AWS-provided URL)

### AWS IAM Permissions Required
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:*",
        "ecr:*",
        "ec2:*",
        "elasticloadbalancing:*",
        "iam:PassRole",
        "logs:*",
        "cloudformation:*",
        "s3:*",
        "cloudfront:*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 🚀 Deployment Steps

### Phase 1: Setup AWS Infrastructure

#### Step 1.1: Create VPC and Networking
```bash
# Create VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=pizza-app-vpc}]'

# Create public subnets (minimum 2 for ALB)
aws ec2 create-subnet --vpc-id <VPC_ID> --cidr-block 10.0.1.0/24 --availability-zone us-east-1a
aws ec2 create-subnet --vpc-id <VPC_ID> --cidr-block 10.0.2.0/24 --availability-zone us-east-1b

# Create Internet Gateway
aws ec2 create-internet-gateway --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=pizza-app-igw}]'
aws ec2 attach-internet-gateway --vpc-id <VPC_ID> --internet-gateway-id <IGW_ID>
```

#### Step 1.2: Create ECR Repository
```bash
# Create repository for Docker images
aws ecr create-repository --repository-name pizza-backend --region us-east-1

# Output: Note the repository URI (e.g., 123456789012.dkr.ecr.us-east-1.amazonaws.com/pizza-backend)
```

#### Step 1.3: Store Secrets
```bash
# Store OpenAI API key
aws secretsmanager create-secret \
  --name pizza-app/openai-key \
  --secret-string '{"OPENAI_API_KEY":"sk-your-key-here"}'

# Store any other sensitive environment variables
aws secretsmanager create-secret \
  --name pizza-app/env \
  --secret-string '{
    "NODE_ENV": "production",
    "PORT": "3000",
    "LOG_LEVEL": "info"
  }'
```

---

### Phase 2: Build and Push Backend Docker Image

#### Step 2.1: Create Dockerfile
Create `server/Dockerfile`:
```dockerfile
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy dependencies and built files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

#### Step 2.2: Create .dockerignore
Create `server/.dockerignore`:
```
node_modules
npm-debug.log
dist
logs
*.md
tests
.git
.env
```

#### Step 2.3: Build and Push
```bash
# Navigate to server directory
cd server

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t pizza-backend:latest .

# Tag image
docker tag pizza-backend:latest <ECR_REPOSITORY_URI>:latest

# Push to ECR
docker push <ECR_REPOSITORY_URI>:latest
```

---

### Phase 3: Deploy ECS Service

#### Step 3.1: Create ECS Cluster
```bash
aws ecs create-cluster --cluster-name pizza-app-cluster --region us-east-1
```

#### Step 3.2: Create Task Definition
Create `server/ecs-task-definition.json`:
```json
{
  "family": "pizza-backend-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<AWS_ACCOUNT_ID>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<AWS_ACCOUNT_ID>:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "pizza-backend",
      "image": "<ECR_REPOSITORY_URI>:latest",
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
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<AWS_ACCOUNT_ID>:secret:pizza-app/openai-key:OPENAI_API_KEY::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/pizza-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

#### Step 3.3: Register Task Definition
```bash
aws ecs register-task-definition --cli-input-json file://server/ecs-task-definition.json
```

#### Step 3.4: Create Application Load Balancer
```bash
# Create security group for ALB
aws ec2 create-security-group \
  --group-name pizza-alb-sg \
  --description "Security group for Pizza App ALB" \
  --vpc-id <VPC_ID>

# Allow HTTP/HTTPS traffic
aws ec2 authorize-security-group-ingress --group-id <ALB_SG_ID> --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id <ALB_SG_ID> --protocol tcp --port 443 --cidr 0.0.0.0/0

# Create ALB
aws elbv2 create-load-balancer \
  --name pizza-app-alb \
  --subnets <SUBNET_ID_1> <SUBNET_ID_2> \
  --security-groups <ALB_SG_ID> \
  --scheme internet-facing \
  --type application

# Create target group
aws elbv2 create-target-group \
  --name pizza-backend-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id <VPC_ID> \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn <ALB_ARN> \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=<TARGET_GROUP_ARN>
```

#### Step 3.5: Create ECS Service
```bash
# Create security group for ECS tasks
aws ec2 create-security-group \
  --group-name pizza-ecs-sg \
  --description "Security group for Pizza App ECS tasks" \
  --vpc-id <VPC_ID>

# Allow traffic from ALB only
aws ec2 authorize-security-group-ingress \
  --group-id <ECS_SG_ID> \
  --protocol tcp \
  --port 3000 \
  --source-group <ALB_SG_ID>

# Create ECS service
aws ecs create-service \
  --cluster pizza-app-cluster \
  --service-name pizza-backend-service \
  --task-definition pizza-backend-task \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<SUBNET_ID_1>,<SUBNET_ID_2>],securityGroups=[<ECS_SG_ID>],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=<TARGET_GROUP_ARN>,containerName=pizza-backend,containerPort=3000" \
  --health-check-grace-period-seconds 60
```

---

### Phase 4: Deploy Frontend to S3 + CloudFront

#### Step 4.1: Build Angular App
```bash
cd llm-angular
npm run build
# Output: dist/llm-angular/browser/
```

#### Step 4.2: Create S3 Bucket
```bash
# Create bucket
aws s3 mb s3://pizza-app-frontend-<UNIQUE_ID>

# Enable static website hosting
aws s3 website s3://pizza-app-frontend-<UNIQUE_ID> \
  --index-document index.html \
  --error-document index.html
```

#### Step 4.3: Update Angular for Production
Update `llm-angular/src/environments/environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://<ALB_DNS_NAME>', // Update with your ALB URL
};
```

#### Step 4.4: Deploy to S3
```bash
# Upload files
aws s3 sync dist/llm-angular/browser/ s3://pizza-app-frontend-<UNIQUE_ID>/ \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

# Upload index.html with no-cache
aws s3 cp dist/llm-angular/browser/index.html s3://pizza-app-frontend-<UNIQUE_ID>/ \
  --cache-control "no-cache, no-store, must-revalidate"
```

#### Step 4.5: Create CloudFront Distribution
```bash
# Create CloudFront distribution (simplified - use AWS Console for full setup)
aws cloudfront create-distribution \
  --origin-domain-name pizza-app-frontend-<UNIQUE_ID>.s3.amazonaws.com \
  --default-root-object index.html
```

**CloudFront Settings:**
- Origin: S3 bucket
- Viewer Protocol Policy: Redirect HTTP to HTTPS
- Allowed HTTP Methods: GET, HEAD, OPTIONS
- Compress Objects: Yes
- Price Class: Use All Edge Locations
- Custom Error Pages: 404 → /index.html (for Angular routing)

---

### Phase 5: Configure Auto-Scaling

#### Step 5.1: Create Auto-Scaling Target
```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/pizza-app-cluster/pizza-backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10
```

#### Step 5.2: Create Scaling Policy
```bash
# CPU-based scaling
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/pizza-app-cluster/pizza-backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name pizza-cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

---

## 💰 Cost Estimation

### Monthly Cost Breakdown (Low-Medium Traffic)

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| **ECS Fargate** | 2 tasks × 0.5 vCPU × 1GB RAM × 24/7 | ~$30 |
| **Application Load Balancer** | 1 ALB + data processing | ~$20 |
| **S3** | 10GB storage + 100K requests | ~$1 |
| **CloudFront** | 100GB data transfer | ~$10 |
| **CloudWatch Logs** | 5GB logs retention (1 month) | ~$3 |
| **Secrets Manager** | 2 secrets | ~$1 |
| **NAT Gateway** (if needed) | 1 NAT × 100GB transfer | ~$40 |
| **Route 53** | Hosted zone + queries | ~$1 |
| **TOTAL** | Without NAT Gateway | **~$66/month** |
| **TOTAL** | With NAT Gateway | **~$106/month** |

### Cost Optimization Tips
- Use private subnets without NAT for ECS (saves $40/month)
- CloudFront caching reduces origin requests
- Auto-scaling reduces costs during low traffic
- S3 Intelligent-Tiering for older assets

---

## 🔐 Environment Variables

### Backend Environment Variables

| Variable | Example | Source | Required |
|----------|---------|--------|----------|
| `NODE_ENV` | `production` | Task definition | ✅ |
| `PORT` | `3000` | Task definition | ✅ |
| `OPENAI_API_KEY` | `sk-...` | Secrets Manager | ✅ |
| `LOG_LEVEL` | `info` | Task definition | ❌ |
| `CORS_ORIGIN` | `https://example.com` | Task definition | ✅ |

### Frontend Environment Variables

Update `environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.your-domain.com',
  version: '1.0.0',
};
```

---

## 📊 Monitoring & Logging

### CloudWatch Dashboards

Create a custom dashboard:
```bash
aws cloudwatch put-dashboard \
  --dashboard-name pizza-app-dashboard \
  --dashboard-body file://cloudwatch-dashboard.json
```

**Key Metrics to Monitor:**
- ECS CPU/Memory utilization
- ALB request count & latency
- Target health check status
- CloudFront cache hit ratio
- S3 bucket size
- API error rates (4xx, 5xx)

### Log Aggregation

**Backend Logs:**
- Location: CloudWatch Logs `/ecs/pizza-backend`
- Retention: 30 days
- Search: Use CloudWatch Insights

**Example Query:**
```
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100
```

### Alarms

Create critical alarms:
```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name pizza-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name pizza-high-errors \
  --alarm-description "Alert when 5xx errors exceed 10" \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 60 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

---

## 🔄 Rollback Strategy

### Quick Rollback Process

#### Option 1: Revert to Previous Task Definition
```bash
# List task definitions
aws ecs list-task-definitions --family-prefix pizza-backend-task

# Update service to previous version
aws ecs update-service \
  --cluster pizza-app-cluster \
  --service pizza-backend-service \
  --task-definition pizza-backend-task:PREVIOUS_VERSION
```

#### Option 2: Rollback Frontend
```bash
# Sync previous build from backup
aws s3 sync s3://pizza-app-frontend-backup/v1.0.0/ s3://pizza-app-frontend-<UNIQUE_ID>/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id <CLOUDFRONT_ID> \
  --paths "/*"
```

### Blue-Green Deployment (Advanced)

For zero-downtime deployments:
1. Create new target group
2. Deploy new ECS tasks to new target group
3. Test new target group
4. Switch ALB listener to new target group
5. Drain old target group
6. Delete old tasks

---

## ✅ Post-Deployment Checklist

### Verification Steps

- [ ] **Health Checks Passing**
  ```bash
  aws elbv2 describe-target-health --target-group-arn <TARGET_GROUP_ARN>
  ```
  Expected: All targets show `healthy`

- [ ] **API Endpoints Working**
  ```bash
  curl https://<ALB_DNS_NAME>/health
  ```
  Expected: `{"status":"ok"}`

- [ ] **Frontend Loading**
  - Visit CloudFront URL
  - Check browser console for errors
  - Test API calls from frontend

- [ ] **HTTPS Working**
  - SSL certificate installed
  - HTTP redirects to HTTPS
  - No mixed content warnings

- [ ] **Logs Flowing**
  ```bash
  aws logs tail /ecs/pizza-backend --follow
  ```

- [ ] **Auto-Scaling Configured**
  ```bash
  aws application-autoscaling describe-scaling-policies \
    --service-namespace ecs \
    --resource-id service/pizza-app-cluster/pizza-backend-service
  ```

- [ ] **CloudWatch Alarms Active**
  ```bash
  aws cloudwatch describe-alarms --alarm-names pizza-high-cpu pizza-high-errors
  ```

- [ ] **Backup Strategy Documented**
  - Database backups (if applicable)
  - ECS task definition versions
  - Frontend S3 versioning enabled

### Security Hardening

- [ ] Enable AWS WAF on CloudFront
- [ ] Configure security headers (CSP, HSTS)
- [ ] Rotate secrets regularly
- [ ] Enable VPC Flow Logs
- [ ] Set up AWS Config rules
- [ ] Enable GuardDuty for threat detection
- [ ] Configure AWS Systems Manager Session Manager (no SSH keys)

### Performance Testing

- [ ] Load test API endpoints
- [ ] Verify auto-scaling triggers
- [ ] Test CloudFront cache hit ratio
- [ ] Measure API response times (target: <500ms)
- [ ] Check LLM integration latency

---

## 🆘 Troubleshooting

### Common Issues

#### Issue: ECS Tasks Failing Health Checks
**Symptoms:** Tasks start but immediately become unhealthy
**Solutions:**
1. Check security group allows traffic from ALB
2. Verify health check path `/health` exists
3. Increase `healthCheckGracePeriodSeconds` to 120
4. Check CloudWatch logs for startup errors

#### Issue: Frontend Can't Reach API
**Symptoms:** CORS errors or network failures
**Solutions:**
1. Add CloudFront URL to CORS whitelist in backend
2. Check ALB security group allows traffic
3. Verify API environment variable in frontend

#### Issue: High Costs
**Symptoms:** AWS bill exceeds expectations
**Solutions:**
1. Remove NAT Gateway if not needed
2. Reduce ECS task count during off-hours
3. Enable S3 Intelligent-Tiering
4. Adjust CloudWatch log retention

---

## 📞 Support & Resources

### AWS Documentation
- [ECS Developer Guide](https://docs.aws.amazon.com/ecs/)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/)

### Internal Resources
- Architecture diagrams: `/docs/BACKEND_ARCHITECTURE.md`
- API documentation: `/server/docs/api/route-inventory.md`
- CI/CD pipeline: `/docs/CI_INTEGRATION.md`

### Team Contacts
- **DevOps Lead:** [Name/Email]
- **Backend Lead:** [Name/Email]
- **Frontend Lead:** [Name/Email]

---

## 📝 Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-01-03 | Initial deployment guide | AI Assistant |

---

## 🎯 Next Steps

After successful deployment:

1. **Set up CI/CD Pipeline**
   - Integrate with BitBucket Pipelines
   - Automate Docker builds
   - Deploy on merge to `main` branch

2. **Add Custom Domain**
   - Purchase domain in Route 53
   - Request SSL certificate (ACM)
   - Update CloudFront and ALB

3. **Enable Production Monitoring**
   - Set up PagerDuty/Slack alerts
   - Create runbooks for incidents
   - Schedule weekly metric reviews

4. **Performance Optimization**
   - Enable CloudFront caching
   - Implement API response caching
   - Optimize Docker image size

5. **Security Enhancements**
   - Enable AWS WAF
   - Set up AWS Shield (DDoS protection)
   - Implement rate limiting

---

**Questions?** Review this document with your team and update placeholders (`<VPC_ID>`, etc.) with actual values during deployment.
