# AWS Deployment Quick Reference Card

**For:** Pizza Ordering System  
**Updated:** January 3, 2026

---

## 🚀 TL;DR - What We're Deploying

```
Angular Frontend → S3 + CloudFront (CDN)
Node.js Backend → ECS Fargate (Docker containers)
Communication  → Application Load Balancer
```

**Estimated Time:** 2-3 hours  
**Estimated Cost:** ~$66/month

---

## ⚡ Quick Commands Cheat Sheet

### 1️⃣ Build & Push Backend (5 mins)

```bash
cd server
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
docker build -t pizza-backend:latest .
docker tag pizza-backend:latest <ECR_URI>:latest
docker push <ECR_URI>:latest
```

### 2️⃣ Update ECS Service (2 mins)

```bash
aws ecs update-service \
  --cluster pizza-app-cluster \
  --service pizza-backend-service \
  --force-new-deployment
```

### 3️⃣ Deploy Frontend (3 mins)

```bash
cd llm-angular
npm run build
aws s3 sync dist/llm-angular/browser/ s3://pizza-app-frontend-<ID>/ --delete
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

### 4️⃣ Check Health (30 secs)

```bash
# Backend health
curl https://<ALB_URL>/health

# ECS service status
aws ecs describe-services \
  --cluster pizza-app-cluster \
  --services pizza-backend-service \
  --query 'services[0].deployments'

# View logs
aws logs tail /ecs/pizza-backend --follow
```

---

## 🔧 Common Operations

### Rollback Backend

```bash
# List versions
aws ecs list-task-definitions --family-prefix pizza-backend-task

# Rollback
aws ecs update-service \
  --cluster pizza-app-cluster \
  --service pizza-backend-service \
  --task-definition pizza-backend-task:PREVIOUS_VERSION
```

### Scale Service

```bash
# Scale up
aws ecs update-service \
  --cluster pizza-app-cluster \
  --service pizza-backend-service \
  --desired-count 5

# Scale down
aws ecs update-service \
  --cluster pizza-app-cluster \
  --service pizza-backend-service \
  --desired-count 1
```

### View Logs

```bash
# Real-time logs
aws logs tail /ecs/pizza-backend --follow

# Last 100 errors
aws logs tail /ecs/pizza-backend --filter-pattern ERROR --since 1h

# Specific time range
aws logs tail /ecs/pizza-backend --since 2026-01-03T10:00:00 --until 2026-01-03T11:00:00
```

### Update Environment Variable

```bash
# Update secret
aws secretsmanager update-secret \
  --secret-id pizza-app/openai-key \
  --secret-string '{"OPENAI_API_KEY":"sk-new-key"}'

# Force new deployment to pick up changes
aws ecs update-service \
  --cluster pizza-app-cluster \
  --service pizza-backend-service \
  --force-new-deployment
```

---

## 🎯 Decision Tree

### When Should I Use This?

```
Do you have an Express server that needs to run 24/7?
├─ YES → Use this guide (ECS)
└─ NO  → Consider Lambda or Static hosting

Do you need WebSockets or long-running connections?
├─ YES → Use this guide (ECS)
└─ NO  → Lambda might work

Do you have in-memory state (sessions, cache)?
├─ YES → Use this guide (ECS)
└─ NO  → Lambda might work

Will requests take longer than 15 minutes?
├─ YES → Use this guide (ECS)
└─ NO  → Lambda might work

Is your traffic predictable and consistent?
├─ YES → Use this guide (ECS is cost-effective)
└─ NO  → Lambda might be cheaper for sporadic traffic
```

---

## 📊 Cost Calculator

```
Base Monthly Cost:
┌────────────────────────┬─────────┐
│ ECS Fargate (2 tasks)  │ $30     │
│ Application Load Bal.  │ $20     │
│ S3 + CloudFront        │ $11     │
│ CloudWatch + Logs      │ $3      │
│ Secrets Manager        │ $1      │
└────────────────────────┴─────────┘
Total: ~$66/month

Optional:
┌────────────────────────┬─────────┐
│ NAT Gateway            │ +$40    │
│ Route 53 Domain        │ +$12    │
│ AWS WAF                │ +$15    │
└────────────────────────┴─────────┘
```

**Scaling Estimate:**

- 10 tasks: ~$150/month
- 50 tasks: ~$750/month
- 100 tasks: ~$1,500/month

---

## 🆘 Emergency Procedures

### Site is Down!

1. **Check ECS Service**

   ```bash
   aws ecs describe-services --cluster pizza-app-cluster --services pizza-backend-service
   ```

   Look for: `runningCount` should match `desiredCount`

2. **Check Target Health**

   ```bash
   aws elbv2 describe-target-health --target-group-arn <ARN>
   ```

   All targets should be `healthy`

3. **Check Recent Logs**

   ```bash
   aws logs tail /ecs/pizza-backend --since 5m
   ```

4. **Quick Fix: Force New Deployment**

   ```bash
   aws ecs update-service --cluster pizza-app-cluster --service pizza-backend-service --force-new-deployment
   ```

5. **Nuclear Option: Rollback**
   ```bash
   aws ecs update-service --cluster pizza-app-cluster --service pizza-backend-service --task-definition pizza-backend-task:PREVIOUS_VERSION
   ```

---

## 📝 Placeholders to Replace

Before deployment, replace these in the full guide:

| Placeholder          | Where to Find           | Example                                                      |
| -------------------- | ----------------------- | ------------------------------------------------------------ |
| `<AWS_ACCOUNT_ID>`   | AWS Console (top right) | `123456789012`                                               |
| `<ECR_URI>`          | ECR Console             | `123456789012.dkr.ecr.us-east-1.amazonaws.com/pizza-backend` |
| `<VPC_ID>`           | VPC Console             | `vpc-0abc123`                                                |
| `<SUBNET_ID_1>`      | VPC → Subnets           | `subnet-0abc123`                                             |
| `<SUBNET_ID_2>`      | VPC → Subnets           | `subnet-1def456`                                             |
| `<ALB_ARN>`          | EC2 → Load Balancers    | `arn:aws:elasticloadbalancing:...`                           |
| `<TARGET_GROUP_ARN>` | EC2 → Target Groups     | `arn:aws:elasticloadbalancing:...`                           |
| `<CLOUDFRONT_ID>`    | CloudFront Console      | `E1234ABCD5678`                                              |
| `<UNIQUE_ID>`        | Random string           | `prod-2026`                                                  |

---

## 🎓 Learning Resources

### If You're New to AWS

1. **Start Here:**

   - AWS Free Tier: First 12 months get limited free services
   - AWS Console: https://console.aws.amazon.com
   - AWS CLI Setup: `aws configure`

2. **Key Concepts to Learn:**

   - **VPC:** Your private network in AWS
   - **ECS:** Container orchestration (like Kubernetes but simpler)
   - **Fargate:** Serverless containers (no server management)
   - **ALB:** Distributes traffic to containers
   - **S3:** File storage (hosts your Angular app)
   - **CloudFront:** CDN (speeds up global access)

3. **Video Tutorials:**
   - "AWS ECS Tutorial for Beginners" (YouTube)
   - "Deploy Node.js to AWS" (YouTube)

---

## ✅ Pre-Deployment Checklist

Print this and check off as you go:

```
Prerequisites:
□ AWS account created
□ Billing enabled
□ AWS CLI installed: `aws --version`
□ Docker installed: `docker --version`
□ Configured AWS CLI: `aws configure`
□ OpenAI API key obtained
□ Code works locally

Infrastructure Ready:
□ VPC created
□ 2 public subnets created
□ ECR repository created
□ Secrets stored in Secrets Manager
□ IAM roles created (ecsTaskExecutionRole, ecsTaskRole)

Backend Deployed:
□ Dockerfile created
□ Docker image built
□ Image pushed to ECR
□ ECS cluster created
□ Task definition registered
□ ALB created and configured
□ Target group created
□ ECS service running
□ Health checks passing

Frontend Deployed:
□ Angular app builds successfully
□ Environment variables updated
□ S3 bucket created
□ Files uploaded to S3
□ CloudFront distribution created
□ Cache invalidation works

Monitoring:
□ CloudWatch logs flowing
□ Alarms configured
□ Dashboard created
□ Test alerts working

Final Tests:
□ Frontend loads
□ API calls work
□ LLM integration working
□ HTTPS working (if domain configured)
□ Auto-scaling tested
```

---

## 🔗 Quick Links

- **Full Deployment Guide:** [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)
- **Architecture Docs:** [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)
- **API Routes:** [../server/docs/api/route-inventory.md](../server/docs/api/route-inventory.md)
- **AWS Console:** https://console.aws.amazon.com
- **AWS Status:** https://status.aws.amazon.com

---

## 🤝 Getting Help

**Before asking for help, gather this info:**

1. Error message (exact text)
2. Service name (ECS/ALB/S3/CloudFront)
3. Region (us-east-1, etc.)
4. Recent changes made
5. CloudWatch logs snippet

**Where to ask:**

- Team Slack: #devops or #deployment
- AWS Support (if paid plan)
- Stack Overflow (tag: aws-ecs)

---

## 🎉 Success Indicators

You know it's working when:

✅ `curl https://<ALB_URL>/health` returns `{"status":"ok"}`  
✅ CloudFront URL loads your Angular app  
✅ API calls from frontend work  
✅ CloudWatch shows logs flowing  
✅ ECS service shows 2/2 tasks running  
✅ ALB shows 2/2 targets healthy  
✅ No errors in browser console

---

**Print this page and keep it handy during deployment!**
