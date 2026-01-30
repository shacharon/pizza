# AWS Console Setup Guide - ECS Autoscaling
**Angular-Piza Backend - Production Deployment**

---

## Prerequisites
- [ ] AWS Account with admin access
- [ ] Docker image pushed to ECR
- [ ] VPC with public + private subnets (2+ AZs)
- [ ] Domain name + ACM certificate (for HTTPS)

---

## Step 1: Create Redis (ElastiCache)

### 1.1 Navigate to ElastiCache Console
1. Go to **ElastiCache** → **Redis clusters**
2. Click **Create Redis cluster**

### 1.2 Configuration
```
Cluster mode: Disabled
Name: angular-piza-redis
Engine version: Redis 7.0
Node type: cache.t4g.micro (512 MB, ~$13/month)
Number of replicas: 0 (single node for now)
Multi-AZ: Disabled

Parameter Group: Create new
  - Name: angular-piza-redis-params
  - maxmemory-policy: allkeys-lru
  - maxmemory: 419430400 (400 MB = 80% of 512 MB)

Subnet Group: Create new
  - Name: angular-piza-redis-subnet
  - Subnets: Select private subnets (2+ AZs)

Security Group: Create new
  - Name: angular-piza-redis-sg
  - Inbound: Port 6379 from ECS security group (will create later)

Encryption: Disabled (not needed for cache data)
Backup: Disabled (cache can be rebuilt)

Maintenance window: Sun 05:00-06:00 UTC
```

3. Click **Create**
4. Wait ~5 minutes for provisioning
5. **Copy endpoint**: `angular-piza-redis.xxxxx.cache.amazonaws.com:6379`

---

## Step 2: Create Security Groups

### 2.1 ECS Tasks Security Group
1. Go to **EC2** → **Security Groups** → **Create security group**
2. Configure:
```
Name: angular-piza-ecs-tasks-sg
Description: Security group for ECS Fargate tasks
VPC: (your VPC)

Inbound rules:
  - Type: Custom TCP
    Port: 3000
    Source: (ALB security group - will add after creating ALB)

Outbound rules:
  - Type: All traffic
    Destination: 0.0.0.0/0
```
3. Click **Create**

### 2.2 ALB Security Group
1. **Create security group**:
```
Name: angular-piza-alb-sg
Description: Security group for Application Load Balancer
VPC: (your VPC)

Inbound rules:
  - Type: HTTPS
    Port: 443
    Source: 0.0.0.0/0
  
  - Type: HTTP
    Port: 80
    Source: 0.0.0.0/0

Outbound rules:
  - Type: All traffic
    Destination: 0.0.0.0/0
```
2. Click **Create**

### 2.3 Update Security Groups
1. Go back to **ECS Tasks SG** → **Edit inbound rules**
2. Add:
   - Source: `angular-piza-alb-sg` (select from dropdown)
3. Go back to **Redis SG** → **Edit inbound rules**
4. Add:
   - Source: `angular-piza-ecs-tasks-sg`

---

## Step 3: Create AWS Secrets Manager Secrets

### 3.1 JWT Secret
1. Go to **Secrets Manager** → **Store a new secret**
2. Secret type: **Other type of secret**
3. Key/value:
   - Key: `JWT_SECRET`
   - Value: (generate 64-char random string)
4. Secret name: `piza/jwt-secret`
5. Click **Store**

### 3.2 Google API Key
1. **Store a new secret**
2. Key: `GOOGLE_API_KEY`, Value: (your key)
3. Secret name: `piza/google-api-key`

### 3.3 OpenAI API Key
1. **Store a new secret**
2. Key: `OPENAI_API_KEY`, Value: (your key)
3. Secret name: `piza/openai-api-key`

**Copy ARNs** for all 3 secrets (will need for task definition)

---

## Step 4: Create Application Load Balancer

### 4.1 Create ALB
1. Go to **EC2** → **Load Balancers** → **Create load balancer**
2. Select **Application Load Balancer**
3. Configure:
```
Name: angular-piza-alb
Scheme: Internet-facing
IP address type: IPv4

Network mapping:
  - VPC: (your VPC)
  - Subnets: Select public subnets (2+ AZs)

Security groups:
  - angular-piza-alb-sg

Listeners:
  - Protocol: HTTPS
    Port: 443
    Default action: Forward to target group (will create next)
  
  - Protocol: HTTP
    Port: 80
    Default action: Redirect to HTTPS (443)
```

### 4.2 Create Target Group
1. Click **Create target group** (new tab)
2. Configure:
```
Target type: IP addresses
Name: angular-piza-tg
Protocol: HTTP
Port: 3000
VPC: (your VPC)

Health check:
  - Protocol: HTTP
  - Path: /healthz
  - Healthy threshold: 2
  - Unhealthy threshold: 2
  - Timeout: 5 seconds
  - Interval: 30 seconds
  - Success codes: 200

Advanced settings:
  - Deregistration delay: 30 seconds
  - Stickiness: Enabled
    - Type: Application-based cookie
    - Cookie name: AWSALB
    - Duration: 3600 seconds
```
3. Click **Create**
4. Go back to ALB creation tab
5. Select `angular-piza-tg` as default target group
6. Add SSL certificate (select from ACM)
7. Click **Create load balancer**

### 4.3 Configure ALB Settings
1. Go to **Load Balancers** → `angular-piza-alb` → **Attributes**
2. Click **Edit**
3. Set:
   - Idle timeout: **30 seconds**
4. Click **Save**

---

## Step 5: Create IAM Roles

### 5.1 ECS Task Execution Role
1. Go to **IAM** → **Roles** → **Create role**
2. Trusted entity: **AWS service** → **Elastic Container Service** → **Elastic Container Service Task**
3. Permissions:
   - Attach: `AmazonECSTaskExecutionRolePolicy`
4. Role name: `angular-piza-ecs-execution-role`
5. Click **Create**

6. Go to the role → **Add permissions** → **Create inline policy**
7. JSON:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:piza/*"
      ]
    }
  ]
}
```
8. Policy name: `SecretsManagerAccess`
9. Click **Create policy**

### 5.2 ECS Task Role
1. **Create role**
2. Trusted entity: **AWS service** → **Elastic Container Service** → **Elastic Container Service Task**
3. Permissions: (none needed for now)
4. Role name: `angular-piza-ecs-task-role`
5. Click **Create**

---

## Step 6: Create ECS Cluster

1. Go to **ECS** → **Clusters** → **Create cluster**
2. Configure:
```
Cluster name: angular-piza-cluster
Infrastructure: AWS Fargate
Container Insights: Enabled
```
3. Click **Create**

---

## Step 7: Create ECS Task Definition

### 7.1 Create Task Definition
1. Go to **ECS** → **Task Definitions** → **Create new task definition**
2. Configure:
```
Family: angular-piza-task
Launch type: AWS Fargate
Operating system: Linux
CPU: 0.5 vCPU (512)
Memory: 1 GB (1024)

Task execution role: angular-piza-ecs-execution-role
Task role: angular-piza-ecs-task-role

Container:
  Name: angular-piza-container
  Image URI: (your ECR image URL)
  
  Port mappings:
    - Container port: 3000
      Protocol: TCP
  
  Environment variables:
    - NODE_ENV = production
    - PORT = 3000
    - ENABLE_REDIS_JOBSTORE = true
    - REDIS_URL = redis://angular-piza-redis.xxxxx.cache.amazonaws.com:6379
    - WS_REQUIRE_AUTH = false
  
  Secrets (from Secrets Manager):
    - JWT_SECRET: (ARN of piza/jwt-secret)
    - GOOGLE_API_KEY: (ARN of piza/google-api-key)
    - OPENAI_API_KEY: (ARN of piza/openai-api-key)
  
  Logging:
    - Log driver: awslogs
    - Log group: Create new → /ecs/angular-piza
    - Stream prefix: ecs
  
  Health check:
    Command: CMD-SHELL,curl -f http://localhost:3000/healthz || exit 1
    Interval: 30
    Timeout: 5
    Retries: 2
    Start period: 60
  
  Timeout (stopTimeout): 60 seconds
```
3. Click **Create**

---

## Step 8: Create ECS Service

### 8.1 Create Service
1. Go to **ECS** → **Clusters** → `angular-piza-cluster` → **Create service**
2. Configure:
```
Launch type: Fargate
Task definition: angular-piza-task:1 (latest)
Service name: angular-piza-service

Desired tasks: 2 (P0 Scale Safety)

Deployment options:
  - Minimum healthy percent: 50
  - Maximum percent: 200
  - Deployment failure detection: Use CloudWatch alarms (optional)

Networking:
  - VPC: (your VPC)
  - Subnets: Select private subnets (2+ AZs)
  - Security group: angular-piza-ecs-tasks-sg
  - Public IP: Disabled

Load balancing:
  - Type: Application Load Balancer
  - Load balancer: angular-piza-alb
  - Target group: angular-piza-tg
  - Health check grace period: 90 seconds

Service auto scaling: Configure (will do in next step)
```
3. Click **Create**

---

## Step 9: Configure Auto Scaling

### 9.1 Create Auto Scaling Target
1. Go to **ECS** → **Clusters** → `angular-piza-cluster` → **Services** → `angular-piza-service`
2. Click **Update service** → **Auto Scaling**
3. Configure:
```
Minimum tasks: 2
Maximum tasks: 6
```
4. Click **Save**

### 9.2 Add Target Tracking Policy - CPU
1. Go to **Auto Scaling** → **Service** → **Auto scaling policies**
2. Click **Create policy**
3. Configure:
```
Policy type: Target tracking
Policy name: angular-piza-cpu-autoscaling

Metric: ECSServiceAverageCPUUtilization
Target value: 60

Scale-out cooldown: 60 seconds
Scale-in cooldown: 180 seconds
```
4. Click **Create**

### 9.3 Add Target Tracking Policy - Request Count
1. Click **Create policy**
2. Configure:
```
Policy type: Target tracking
Policy name: angular-piza-request-count-autoscaling

Metric: ALBRequestCountPerTarget
Target value: 80

Scale-out cooldown: 60 seconds
Scale-in cooldown: 180 seconds
```
3. Click **Create**

---

## Step 10: Create CloudWatch Alarms

### 10.1 Redis Memory Alarm
1. Go to **CloudWatch** → **Alarms** → **Create alarm**
2. Configure:
```
Metric: ElastiCache → By Cache Cluster → DatabaseMemoryUsagePercentage
Cluster: angular-piza-redis
Statistic: Average
Period: 5 minutes

Conditions:
  - Threshold type: Static
  - Greater than: 80

Actions:
  - In alarm: (create SNS topic for notifications)
  - Name: angular-piza-redis-memory-high
```
3. Click **Create**

### 10.2 Redis CPU Alarm
Similar to above, but:
- Metric: `CPUUtilization`
- Threshold: 70

### 10.3 ECS CPU Alarm
```
Metric: ECS → By Service → CPUUtilization
Cluster: angular-piza-cluster
Service: angular-piza-service
Threshold: 80
```

### 10.4 ALB 5xx Errors
```
Metric: ApplicationELB → Per AppELB, per TG Metrics → HTTPCode_Target_5XX_Count
Load Balancer: angular-piza-alb
Target Group: angular-piza-tg
Statistic: Sum
Period: 5 minutes
Threshold: 10 (sum over 5 min)
```

---

## Step 11: Configure DNS (Route 53)

1. Go to **Route 53** → **Hosted zones** → (your domain)
2. Create record:
```
Record name: api.yourdomain.com
Record type: A - IPv4 address
Alias: Yes
Route traffic to: 
  - Alias to Application Load Balancer
  - Region: (your region)
  - Load balancer: angular-piza-alb
Routing policy: Simple
```
3. Click **Create**

---

## Deployment Complete! 🎉

Your service is now:
- ✅ Running with 2 tasks (redundancy)
- ✅ Auto-scaling based on CPU and request count
- ✅ Health checking via ALB
- ✅ Using Redis for distributed state
- ✅ Gracefully handling shutdowns
- ✅ Monitoring via CloudWatch

**Next**: See VALIDATION_CHECKLIST.md for testing procedures
