# AWS Deployment Documentation Suite

**Welcome!** This folder contains everything you need to deploy the Pizza Ordering System to AWS.

---

## 📚 Documentation Structure

### 1. Start Here: Decision & Overview

**[AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)** - *Comprehensive Guide*
- ✅ Why we chose ECS over Lambda
- ✅ Complete step-by-step deployment instructions
- ✅ Prerequisites and cost estimates
- ✅ Monitoring and troubleshooting
- **Time to read:** 30 minutes
- **Best for:** First-time deployers, detailed reference

---

### 2. Quick Commands

**[AWS_DEPLOYMENT_QUICK_REFERENCE.md](./AWS_DEPLOYMENT_QUICK_REFERENCE.md)** - *Cheat Sheet*
- ✅ Common commands (deploy, rollback, scale)
- ✅ Emergency procedures
- ✅ Cost calculator
- ✅ Pre-deployment checklist
- **Time to read:** 5 minutes
- **Best for:** Daily operations, quick lookups

---

### 3. Visual Architecture

**[AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md](./AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md)** - *Diagrams*
- ✅ Architecture diagrams (network, security, scaling)
- ✅ Request flow visualization
- ✅ Monitoring dashboards
- ✅ Future enhancements roadmap
- **Time to read:** 15 minutes
- **Best for:** Team presentations, stakeholder meetings

---

## 🎯 Quick Start (3 Steps)

If you just want to get started immediately:

### Step 1: Prerequisites (10 minutes)
```bash
# Install AWS CLI
# Windows: Download from https://aws.amazon.com/cli/
# Mac: brew install awscli
# Linux: curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"

# Configure AWS credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-1), Output format (json)

# Verify installation
aws --version
aws sts get-caller-identity
```

### Step 2: Create Infrastructure (45 minutes)
Follow **[AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)** Phase 1-3:
- Create VPC and subnets
- Create ECR repository
- Store secrets in Secrets Manager
- Create ECS cluster and task definition
- Set up Application Load Balancer

### Step 3: Deploy Applications (30 minutes)
Follow **[AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)** Phase 4-5:
- Build and push Docker image
- Deploy backend to ECS
- Build and upload frontend to S3
- Create CloudFront distribution

**Total Time:** ~90 minutes  
**Result:** Fully deployed application on AWS!

---

## 🤔 Decision Framework: ECS vs Lambda

### When to Use ECS (✅ Our Choice)

- ✅ Long-running Express/Node.js servers
- ✅ WebSocket or streaming connections needed
- ✅ In-memory state management (sessions, cache)
- ✅ Requests can take >15 minutes
- ✅ Predictable, consistent traffic
- ✅ Minimal code changes needed

### When Lambda Might Be Better

- ⚠️ Event-driven, sporadic workload
- ⚠️ Very low traffic (<1000 req/day)
- ⚠️ Stateless application design
- ⚠️ Requests complete in <15 minutes
- ⚠️ Willing to refactor for serverless

**Our Verdict:** ECS is the right choice for this architecture.

---

## 💰 Cost Summary

| Configuration | Monthly Cost | Use Case |
|---------------|--------------|----------|
| **Minimal** (1-2 tasks) | $66 | Development, low traffic |
| **Standard** (2-5 tasks) | $90 | Production, medium traffic |
| **Scaled** (5-10 tasks) | $150 | High traffic, peak hours |

**Included in cost:**
- ECS Fargate tasks
- Application Load Balancer
- S3 + CloudFront
- CloudWatch Logs
- Secrets Manager

**Not included:**
- OpenAI API costs (pay-as-you-go)
- Domain registration (~$12/year)
- AWS WAF (~$15/month, optional)

---

## 📖 Documentation Map by Role

### For Developers
1. **Read:** [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) (Phases 1-5)
2. **Bookmark:** [AWS_DEPLOYMENT_QUICK_REFERENCE.md](./AWS_DEPLOYMENT_QUICK_REFERENCE.md) (Daily commands)
3. **Reference:** [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) (App architecture)

### For DevOps Engineers
1. **Read:** [AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md](./AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md) (Network design)
2. **Implement:** [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) (Infrastructure setup)
3. **Use:** [CI_INTEGRATION.md](./CI_INTEGRATION.md) (Automation)

### For Project Managers
1. **Review:** This README (Overview)
2. **Present:** [AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md](./AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md) (Stakeholder visuals)
3. **Budget:** [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) → Cost Estimation section

### For QA/Testing
1. **Read:** [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) → Post-Deployment Checklist
2. **Use:** [AWS_DEPLOYMENT_QUICK_REFERENCE.md](./AWS_DEPLOYMENT_QUICK_REFERENCE.md) → Health Checks
3. **Test:** [../server/docs/api/route-inventory.md](../server/docs/api/route-inventory.md) (API endpoints)

---

## 🚀 Deployment Phases Overview

### Phase 0: Planning (1 hour)
- [ ] Read documentation
- [ ] Gather AWS credentials
- [ ] Estimate costs
- [ ] Get stakeholder approval

### Phase 1: Infrastructure Setup (1-2 hours)
- [ ] Create VPC and networking
- [ ] Set up security groups
- [ ] Create ECR repository
- [ ] Configure Secrets Manager

### Phase 2: Backend Deployment (1 hour)
- [ ] Create Dockerfile
- [ ] Build and push Docker image
- [ ] Create ECS cluster and task definition
- [ ] Deploy ECS service with ALB

### Phase 3: Frontend Deployment (30 minutes)
- [ ] Build Angular application
- [ ] Create S3 bucket
- [ ] Upload static files
- [ ] Configure CloudFront distribution

### Phase 4: Monitoring & Alarms (30 minutes)
- [ ] Configure CloudWatch dashboards
- [ ] Set up alarms (CPU, errors)
- [ ] Test log aggregation
- [ ] Verify health checks

### Phase 5: Testing & Validation (1 hour)
- [ ] Test API endpoints
- [ ] Verify frontend loading
- [ ] Load testing
- [ ] Security validation

**Total Estimated Time:** 5-6 hours (first-time deployment)  
**Subsequent Deployments:** ~10 minutes (automated)

---

## ⚡ Quick Command Reference

### Deploy Backend
```bash
cd server
docker build -t pizza-backend:latest .
docker tag pizza-backend:latest <ECR_URI>:latest
docker push <ECR_URI>:latest
aws ecs update-service --cluster pizza-app-cluster --service pizza-backend-service --force-new-deployment
```

### Deploy Frontend
```bash
cd llm-angular
npm run build
aws s3 sync dist/llm-angular/browser/ s3://pizza-app-frontend-<ID>/ --delete
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

### Check Status
```bash
# Backend health
curl https://<ALB_URL>/health

# View logs
aws logs tail /ecs/pizza-backend --follow

# Service status
aws ecs describe-services --cluster pizza-app-cluster --services pizza-backend-service
```

### Rollback
```bash
# Rollback backend
aws ecs update-service --cluster pizza-app-cluster --service pizza-backend-service --task-definition pizza-backend-task:PREVIOUS_VERSION

# Rollback frontend
aws s3 sync s3://pizza-app-frontend-backup/ s3://pizza-app-frontend-<ID>/ --delete
```

---

## 🆘 Troubleshooting Guide

### Issue: "Access Denied" Errors

**Cause:** Insufficient IAM permissions  
**Fix:**
```bash
# Check current permissions
aws sts get-caller-identity

# Attach required policies (ask admin)
# - AmazonEC2FullAccess
# - AmazonECS_FullAccess
# - AmazonS3FullAccess
# - CloudFrontFullAccess
```

### Issue: Docker Build Fails

**Cause:** Node modules or dependencies missing  
**Fix:**
```bash
cd server
rm -rf node_modules package-lock.json
npm install
npm run build
docker build -t pizza-backend:latest .
```

### Issue: ECS Tasks Won't Start

**Cause:** Secrets Manager access denied  
**Fix:**
```bash
# Check IAM role has SecretsManagerReadWrite policy
aws iam list-attached-role-policies --role-name ecsTaskExecutionRole

# Attach policy if missing
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

### Issue: High Costs

**Cause:** Resources running when not needed  
**Fix:**
```bash
# Scale down during off-hours
aws ecs update-service --cluster pizza-app-cluster --service pizza-backend-service --desired-count 1

# Or stop completely (dev environment)
aws ecs update-service --cluster pizza-app-cluster --service pizza-backend-service --desired-count 0
```

### Issue: Frontend Can't Reach API

**Cause:** CORS configuration  
**Fix:** Update backend `server/src/config/cors.ts` to include CloudFront URL

More troubleshooting: See [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) → Troubleshooting section

---

## 📊 Key Metrics to Monitor

### Health Indicators (Green = Good)

| Metric | Target | Alert If |
|--------|--------|----------|
| **ECS CPU** | <70% | >80% for 5 min |
| **ECS Memory** | <80% | >90% for 5 min |
| **ALB Latency** | <500ms | >2s average |
| **Target Health** | 100% healthy | <50% healthy |
| **Error Rate (5xx)** | <1% | >5% |
| **CloudFront Cache Hit** | >80% | <50% |

### Cost Alerts

Set up billing alarms:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name pizza-high-bill \
  --alarm-description "Alert when AWS bill exceeds $100" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold
```

---

## 🔐 Security Checklist

Before going to production:

- [ ] **Secrets:** All API keys in Secrets Manager (not in code)
- [ ] **HTTPS:** SSL certificate installed on ALB and CloudFront
- [ ] **Security Groups:** Minimal access (ALB → ECS only)
- [ ] **IAM Roles:** Least privilege access
- [ ] **VPC:** Subnets properly configured
- [ ] **Logs:** CloudWatch logs enabled and retention set
- [ ] **Backups:** S3 versioning enabled
- [ ] **WAF:** AWS WAF configured (optional but recommended)
- [ ] **Monitoring:** Alarms set up for critical metrics
- [ ] **Updates:** Docker base images kept up to date

---

## 📞 Support Resources

### Internal Documentation
- **Backend Architecture:** [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)
- **API Reference:** [../server/docs/api/route-inventory.md](../server/docs/api/route-inventory.md)
- **CI/CD Pipeline:** [CI_INTEGRATION.md](./CI_INTEGRATION.md)

### AWS Documentation
- **ECS Guide:** https://docs.aws.amazon.com/ecs/
- **CloudFront Guide:** https://docs.aws.amazon.com/cloudfront/
- **ALB Guide:** https://docs.aws.amazon.com/elasticloadbalancing/

### Community Support
- **AWS Forums:** https://forums.aws.amazon.com/
- **Stack Overflow:** Tag with `amazon-ecs`, `aws-fargate`
- **AWS Support:** https://console.aws.amazon.com/support/

### Team Contacts
- **DevOps Lead:** [Add contact]
- **Backend Lead:** [Add contact]
- **AWS Admin:** [Add contact]

---

## 🎓 Learning Path

### Week 1: AWS Basics
- [ ] Complete AWS Free Tier signup
- [ ] AWS Console tour (15 min)
- [ ] VPC and networking basics (YouTube)
- [ ] IAM roles and policies (YouTube)

### Week 2: Container Basics
- [ ] Docker tutorial (Docker 101)
- [ ] Build a simple Docker image
- [ ] Push image to ECR
- [ ] Run container locally

### Week 3: ECS Deployment
- [ ] Follow [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)
- [ ] Deploy to dev environment
- [ ] Test and validate
- [ ] Monitor logs and metrics

### Week 4: Production Readiness
- [ ] Set up CI/CD pipeline
- [ ] Configure auto-scaling
- [ ] Enable monitoring and alarms
- [ ] Perform load testing
- [ ] Deploy to production

---

## 🔄 Continuous Improvement

### After First Deployment

1. **Week 1-2:** Monitor and optimize
   - Review CloudWatch metrics
   - Adjust auto-scaling thresholds
   - Optimize Docker image size

2. **Month 1:** Add features
   - Enable ElastiCache (if needed)
   - Add RDS database (if needed)
   - Implement blue-green deployment

3. **Month 2:** Advanced monitoring
   - AWS X-Ray tracing
   - Custom CloudWatch dashboards
   - PagerDuty/Slack integration

4. **Month 3:** Multi-region (if needed)
   - Deploy to second region
   - Route53 geo-routing
   - Database replication

---

## 📝 Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-01-03 | Initial deployment documentation | AI Assistant |

---

## 🎯 Next Actions

### For Your First Deployment

1. **Today:**
   - [ ] Read this README (10 min)
   - [ ] Review [AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md](./AWS_DEPLOYMENT_ARCHITECTURE_DIAGRAMS.md) (15 min)
   - [ ] Get AWS credentials

2. **This Week:**
   - [ ] Follow [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) step-by-step
   - [ ] Deploy to dev/staging environment
   - [ ] Test thoroughly

3. **Next Week:**
   - [ ] Review metrics and costs
   - [ ] Set up CI/CD pipeline
   - [ ] Deploy to production

---

## ✅ Success Criteria

You'll know deployment is successful when:

- ✅ Frontend loads at CloudFront URL
- ✅ Backend API responds at ALB URL
- ✅ Health checks pass: `/health` returns 200
- ✅ Logs flowing to CloudWatch
- ✅ Auto-scaling configured and tested
- ✅ Monitoring alarms active
- ✅ No errors in logs for 24 hours
- ✅ Load testing shows acceptable performance
- ✅ Team can deploy updates independently

---

## 💡 Tips for Success

1. **Start Small:** Deploy to dev first, production later
2. **Document Everything:** Update this guide as you learn
3. **Monitor Costs:** Set up billing alerts immediately
4. **Test Often:** Don't wait until production to test
5. **Ask Questions:** Use team Slack or AWS support
6. **Automate Early:** CI/CD saves time in the long run
7. **Keep Secrets Safe:** Never commit API keys to Git
8. **Review Logs:** Check CloudWatch daily for first week

---

**Ready to deploy?** Start with [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)!

**Questions?** Review the troubleshooting section or ask your team lead.

**Good luck! 🚀**
