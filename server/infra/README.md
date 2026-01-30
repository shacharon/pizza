# Angular-Piza Backend - ECS Autoscaling Infrastructure

Production-ready infrastructure configuration for multi-task ECS deployment with autoscaling.

---

## 📁 Files Overview

### 1. **ecs-autoscaling.tf** (IaC - Recommended)
Complete Terraform configuration for automated infrastructure provisioning.

**What it includes**:
- ECS Cluster + Fargate tasks
- Application Load Balancer + Target Groups
- ElastiCache Redis (single-node)
- Security Groups (ECS, ALB, Redis)
- Auto Scaling policies (CPU + Request Count)
- CloudWatch Alarms (Memory, CPU, 5xx errors)
- IAM Roles (Task Execution + Task Role)
- Secrets Manager integration

**Usage**:
```bash
cd server/infra

# Initialize Terraform
terraform init

# Review plan
terraform plan

# Apply (creates all resources)
terraform apply

# Get outputs
terraform output
```

**Prerequisites**:
- AWS CLI configured
- Terraform installed (v1.0+)
- Docker image in ECR
- ACM certificate for HTTPS
- VPC with public + private subnets

---

### 2. **AWS_CONSOLE_SETUP.md** (Manual Setup)
Step-by-step guide for creating infrastructure via AWS Console.

**When to use**:
- No Terraform experience
- One-time setup
- Learning AWS services
- Prefer GUI over IaC

**Estimated time**: 60-90 minutes

---

### 3. **VALIDATION_CHECKLIST.md** (Post-Deployment)
Comprehensive testing procedures to verify production readiness.

**Sections**:
- Phase 1: Basic Health (Service, Tasks, ALB, Redis)
- Phase 2: API Functionality (Search, WebSocket)
- Phase 3: Scale Events (Manual + Auto)
- Phase 4: Failure Scenarios (Task, Redis, Health Check)
- Phase 5: Performance (Response Time, Latency)
- Phase 6: Monitoring (Logs, Alarms, Insights)
- Phase 7: Security (Security Groups, Secrets, HTTPS)
- Phase 8: Cost Validation

**Usage**: Execute tests in order after deployment.

---

### 4. **SIZING_GUIDE.md** (Capacity Planning)
Resource recommendations based on expected traffic.

**Covers**:
- Traffic profiles (10k, 100k, 1M searches/day)
- ECS task sizing (CPU/Memory)
- Redis sizing (Node types)
- Auto-scaling policies explained
- Cost optimization strategies
- Disaster recovery planning

**Use this to**: Right-size resources before deployment.

---

## 🚀 Quick Start

### Option A: Terraform (Recommended)
```bash
# 1. Update variables in ecs-autoscaling.tf
vim ecs-autoscaling.tf  # Edit variables section

# 2. Create secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name piza/jwt-secret \
  --secret-string '{"JWT_SECRET":"<64-char-random-string>"}'

aws secretsmanager create-secret \
  --name piza/google-api-key \
  --secret-string '{"GOOGLE_API_KEY":"<your-key>"}'

aws secretsmanager create-secret \
  --name piza/openai-api-key \
  --secret-string '{"OPENAI_API_KEY":"<your-key>"}'

# 3. Apply Terraform
terraform init
terraform plan
terraform apply

# 4. Deploy container
# Push Docker image to ECR
# ECS will automatically pull and start tasks

# 5. Validate
# Follow VALIDATION_CHECKLIST.md Phase 1-8
```

### Option B: AWS Console
```bash
# Follow AWS_CONSOLE_SETUP.md step-by-step
# Estimated time: 60-90 minutes
```

---

## 📊 Architecture Diagram

```
                                  Internet
                                     |
                                     |
                          ┌──────────▼──────────┐
                          │   Route 53 (DNS)    │
                          └──────────┬──────────┘
                                     |
                          ┌──────────▼──────────┐
                          │   CloudFront (CDN)  │ (Optional)
                          └──────────┬──────────┘
                                     |
                    ┌────────────────▼────────────────┐
                    │   Application Load Balancer     │
                    │   - HTTPS (443) + HTTP (80)    │
                    │   - Sticky sessions (WS)       │
                    │   - Health checks (/healthz)   │
                    └────────────────┬────────────────┘
                                     |
               ┌─────────────────────┼─────────────────────┐
               |                     |                     |
    ┌──────────▼──────────┐ ┌───────▼─────────┐ ┌────────▼──────────┐
    │  ECS Task 1         │ │  ECS Task 2     │ │  ECS Task 3-6     │
    │  (Fargate)          │ │  (Fargate)      │ │  (Auto-scaled)    │
    │  - Node.js server   │ │  - Node.js      │ │  - Node.js        │
    │  - Port 3000        │ │  - Port 3000    │ │  - Port 3000      │
    │  - Private subnet   │ │  - Private      │ │  - Private        │
    └─────────┬───────────┘ └────────┬────────┘ └────────┬──────────┘
              |                      |                    |
              └──────────────────────┼────────────────────┘
                                     |
                          ┌──────────▼──────────┐
                          │   ElastiCache Redis │
                          │   - Single node     │
                          │   - allkeys-lru     │
                          │   - Private subnet  │
                          └─────────────────────┘

                          ┌─────────────────────┐
                          │   CloudWatch        │
                          │   - Logs            │
                          │   - Metrics         │
                          │   - Alarms          │
                          └─────────────────────┘
```

---

## ⚙️ Configuration Summary

### ECS Service
```yaml
Desired Count: 2 (baseline)
Min: 2 (redundancy)
Max: 6 (auto-scale limit)

Deployment:
  MinHealthyPercent: 50 (allow 1 task down during deploy)
  MaxPercent: 200 (allow 2 extra tasks during deploy)

Health Check Grace: 90 seconds (allow slow startup)
Stop Timeout: 60 seconds (graceful shutdown)
```

### ALB
```yaml
Health Check:
  Path: GET /healthz
  Interval: 30 seconds
  Healthy Threshold: 2 (60s to become healthy)
  Unhealthy Threshold: 2 (60s to become unhealthy)
  Timeout: 5 seconds

Idle Timeout: 30 seconds (match backend timeout)

Stickiness:
  Type: Application-based cookie
  Cookie: AWSALB
  Duration: 3600 seconds (1 hour)
  Enabled: For WebSocket connections
```

### Redis
```yaml
Node Type: cache.t4g.micro (512 MB)
Eviction Policy: allkeys-lru
Max Memory: 400 MB (80% of 512 MB)

Security:
  Access: From ECS tasks only
  Encryption: At-rest (optional)
```

### Auto Scaling
```yaml
Policies:
  1. CPU Utilization
     Target: 60%
     Scale-out cooldown: 60s
     Scale-in cooldown: 180s
  
  2. Request Count Per Target
     Target: 80 requests/minute
     Scale-out cooldown: 60s
     Scale-in cooldown: 180s

Behavior:
  - Whichever policy triggers first causes scale
  - Both scale-out and scale-in are automatic
  - Manual override via ECS console
```

---

## 🔍 Monitoring

### CloudWatch Dashboards
```
1. ECS Service Dashboard
   - CPU utilization (per task + aggregate)
   - Memory utilization
   - Task count (running/desired)
   - Deployment status

2. ALB Dashboard
   - Request count
   - Target response time (p50/p95/p99)
   - 4xx/5xx error rates
   - Target health

3. Redis Dashboard
   - Memory usage
   - CPU utilization
   - Evictions
   - Commands/sec
```

### Key Metrics to Watch
```
P0 (Critical):
- Service CPU > 80% → Scale out needed
- Redis Memory > 90% → Evictions imminent
- ALB 5xx > 5% → Backend errors
- Target unhealthy > 0 → Service degraded

P1 (Warning):
- Service CPU > 70% → Approaching limit
- Redis CPU > 70% → Slow responses
- ALB 4xx > 10% → Client errors
- Response time p95 > 3s → Slow queries
```

### Alerting
```bash
# Create SNS topic for alerts
aws sns create-topic --name angular-piza-alerts

# Subscribe email
aws sns subscribe \
  --topic-arn arn:aws:sns:REGION:ACCOUNT:angular-piza-alerts \
  --protocol email \
  --notification-endpoint ops@example.com

# Update alarm actions in Terraform or Console
```

---

## 🛡️ Security Checklist

- [x] Secrets stored in AWS Secrets Manager (not env vars)
- [x] Security groups: least-privilege access
- [x] ECS tasks in private subnets (no public IP)
- [x] Redis accessible only from ECS tasks
- [x] ALB enforces HTTPS (HTTP redirects to HTTPS)
- [x] JWT_SECRET >= 32 characters
- [x] ENABLE_REDIS_JOBSTORE=true in production
- [x] Container insights enabled (logging)
- [x] Execution role has Secrets Manager access only
- [x] Task role has no unnecessary permissions

---

## 💰 Cost Breakdown

### Baseline (2 tasks, 10k searches/day)
```
ECS Fargate (2 × 0.5 vCPU, 1GB): $59/month
ElastiCache (cache.t4g.micro): $13/month
Application Load Balancer: $16/month
CloudWatch Logs (7-day retention): $5/month
NAT Gateway (private subnets): $33/month
Data transfer: $10/month

Total: ~$136/month
```

### Medium (4 tasks, 100k searches/day)
```
ECS Fargate (4 × 1 vCPU, 2GB): $236/month
ElastiCache (cache.t4g.small): $26/month
ALB + NAT + Logs: $54/month

Total: ~$316/month
```

### Peak (6 tasks during surge)
```
Additional ECS tasks: +$118/month
Total during surge: $434/month

Average (assuming 20% surge time): ~$340/month
```

### Cost Optimization
- **Savings Plans**: 20-30% off ECS (requires 1-year commitment)
- **Multi-AZ Redis**: 2x cost but zero downtime
- **Reserved Capacity**: 40-50% off (3-year commitment)

---

## 🔧 Troubleshooting

### Tasks Won't Start
```bash
# Check task events
aws ecs describe-tasks --cluster angular-piza-cluster --tasks <task-arn>

# Common issues:
# 1. Can't pull image → Check ECR permissions
# 2. Can't fetch secrets → Check IAM role + Secrets Manager ARN
# 3. Health check failing → Check /healthz endpoint + Redis connectivity
```

### Health Checks Failing
```bash
# Exec into task
aws ecs execute-command \
  --cluster angular-piza-cluster \
  --task <task-arn> \
  --container angular-piza-container \
  --interactive \
  --command "/bin/sh"

# Test health endpoint
curl http://localhost:3000/healthz

# Check Redis
redis-cli -h <redis-endpoint> ping
```

### Auto-Scaling Not Working
```bash
# Check scaling activities
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs

# Common issues:
# 1. Cooldown period active → Wait 60-180s
# 2. Already at max capacity → Increase max tasks
# 3. Metric not breached → Check CloudWatch metrics
```

---

## 📚 Additional Resources

- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/intro.html)
- [Fargate Task Sizing](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html)
- [ElastiCache Best Practices](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/BestPractices.html)
- [ALB Target Groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)

---

## 🆘 Support

### Getting Help
1. Check **VALIDATION_CHECKLIST.md** troubleshooting section
2. Review CloudWatch logs: `/ecs/angular-piza`
3. Check ECS service events (Console → ECS → Service → Events)
4. Review ALB target health (Console → EC2 → Target Groups)

### Escalation
- P0 (Service down): Page on-call engineer
- P1 (Degraded): Slack #ops-alerts
- P2 (Warning): Email ops@example.com

---

## ✅ Deployment Checklist

**Pre-Deployment**:
- [ ] Docker image built and pushed to ECR
- [ ] Secrets created in AWS Secrets Manager
- [ ] ACM certificate issued for domain
- [ ] VPC configured (public + private subnets, 2+ AZs)
- [ ] Sizing guide reviewed (right-sized for traffic)

**Deployment**:
- [ ] Terraform applied OR Console setup completed
- [ ] DNS configured (Route 53 → ALB)
- [ ] 2 tasks running and healthy
- [ ] ALB health checks passing
- [ ] Redis connectivity confirmed

**Post-Deployment**:
- [ ] All validation tests passed (VALIDATION_CHECKLIST.md)
- [ ] Monitoring dashboards configured
- [ ] Alerts tested (SNS notifications working)
- [ ] Rollback plan documented
- [ ] Team trained on monitoring/troubleshooting

---

**Questions?** Review the files in this directory or open an issue.
