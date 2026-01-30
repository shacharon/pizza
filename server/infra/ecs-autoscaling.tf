# ============================================================================
# Angular-Piza Backend - ECS Autoscaling Configuration
# P0 Scale Safety: Multi-task deployment with Redis-backed state
# ============================================================================

# Variables (adjust per environment)
variable "app_name" {
  default = "angular-piza-backend"
}

variable "environment" {
  default = "production"
}

variable "vpc_id" {
  description = "VPC ID for resources"
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
}

variable "container_image" {
  description = "Docker image URI (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com/angular-piza:latest)"
}

variable "redis_url" {
  description = "Redis connection URL (e.g., redis://redis-cluster.cache.amazonaws.com:6379)"
}

variable "jwt_secret" {
  description = "JWT secret (min 32 chars) - use AWS Secrets Manager"
  sensitive   = true
}

variable "google_api_key" {
  description = "Google API key - use AWS Secrets Manager"
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key - use AWS Secrets Manager"
  sensitive   = true
}

# ============================================================================
# 1. ECS Cluster
# ============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "${var.app_name}-cluster"
    Environment = var.environment
  }
}

# ============================================================================
# 2. Security Groups
# ============================================================================

# ECS Tasks Security Group
resource "aws_security_group" "ecs_tasks" {
  name        = "${var.app_name}-ecs-tasks-${var.environment}"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-ecs-tasks-sg"
  }
}

# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "${var.app_name}-alb-${var.environment}"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from internet (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-alb-sg"
  }
}

# Redis Security Group
resource "aws_security_group" "redis" {
  name        = "${var.app_name}-redis-${var.environment}"
  description = "Security group for Redis (ElastiCache)"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from ECS tasks only"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  tags = {
    Name = "${var.app_name}-redis-sg"
  }
}

# ============================================================================
# 3. Redis (ElastiCache)
# ============================================================================

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.app_name}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.app_name}-redis"
  engine               = "redis"
  node_type            = "cache.t4g.micro" # Adjust based on load (see sizing below)
  num_cache_nodes      = 1
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  engine_version       = "7.0"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]

  # Maintenance window (adjust to low-traffic period)
  maintenance_window = "sun:05:00-sun:06:00"

  tags = {
    Name        = "${var.app_name}-redis"
    Environment = var.environment
  }
}

resource "aws_elasticache_parameter_group" "redis" {
  name   = "${var.app_name}-redis-params"
  family = "redis7"

  # P0 Scale Safety: LRU eviction for cache stability
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  # Set maxmemory to ~80% of node memory (cache.t4g.micro = 512MB → 400MB)
  parameter {
    name  = "maxmemory"
    value = "419430400" # 400MB in bytes
  }
}

# ============================================================================
# 4. Application Load Balancer
# ============================================================================

resource "aws_lb" "main" {
  name               = "${var.app_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = true # Protect production ALB
  idle_timeout              = 30    # P0 Scale Safety: Match backend timeout

  tags = {
    Name        = "${var.app_name}-alb"
    Environment = var.environment
  }
}

# Target Group (Main)
resource "aws_lb_target_group" "main" {
  name        = "${var.app_name}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  # P0 Scale Safety: Health check on /healthz
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/healthz"
    matcher             = "200"
    protocol            = "HTTP"
  }

  # P0 Scale Safety: Graceful shutdown - allow 30s drain
  deregistration_delay = 30

  # Stickiness for WebSocket connections
  stickiness {
    type            = "app_cookie"
    cookie_name     = "AWSALB"
    cookie_duration = 3600 # 1 hour
    enabled         = true
  }

  tags = {
    Name = "${var.app_name}-tg"
  }
}

# HTTPS Listener (443)
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = "arn:aws:acm:REGION:ACCOUNT:certificate/CERT_ID" # TODO: Replace

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}

# HTTP Listener (80) - Redirect to HTTPS
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ============================================================================
# 5. ECS Task Definition
# ============================================================================

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.app_name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"  # 0.5 vCPU
  memory                   = "1024" # 1 GB
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "${var.app_name}-container"
      image = var.container_image

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "PORT"
          value = "3000"
        },
        {
          name  = "ENABLE_REDIS_JOBSTORE"
          value = "true"
        },
        {
          name  = "REDIS_URL"
          value = var.redis_url
        },
        {
          name  = "WS_REQUIRE_AUTH"
          value = "false" # Set to "true" for production
        }
      ]

      secrets = [
        {
          name      = "JWT_SECRET"
          valueFrom = "arn:aws:secretsmanager:REGION:ACCOUNT:secret:piza/jwt-secret" # TODO: Create in Secrets Manager
        },
        {
          name      = "GOOGLE_API_KEY"
          valueFrom = "arn:aws:secretsmanager:REGION:ACCOUNT:secret:piza/google-api-key"
        },
        {
          name      = "OPENAI_API_KEY"
          valueFrom = "arn:aws:secretsmanager:REGION:ACCOUNT:secret:piza/openai-api-key"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }

      # P0 Scale Safety: Graceful shutdown
      stopTimeout = 60

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/healthz || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 2
        startPeriod = 60
      }
    }
  ])
}

# ============================================================================
# 6. ECS Service
# ============================================================================

resource "aws_ecs_service" "app" {
  name            = "${var.app_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2 # P0 Scale Safety: Start with 2 for redundancy

  launch_type = "FARGATE"

  # P0 Scale Safety: Rolling deployment
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  # P0 Scale Safety: Health check grace period for slow starts
  health_check_grace_period_seconds = 90

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "${var.app_name}-container"
    container_port   = 3000
  }

  # Force new deployment on task definition change
  force_new_deployment = true

  # Enable ECS managed tags
  enable_ecs_managed_tags = true
  propagate_tags          = "SERVICE"

  tags = {
    Name        = "${var.app_name}-service"
    Environment = var.environment
  }

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy_attachment.ecs_execution
  ]
}

# ============================================================================
# 7. Auto Scaling
# ============================================================================

# Auto Scaling Target
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = 6
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Target Tracking Policy: CPU Utilization
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.app_name}-cpu-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = 60.0
    scale_in_cooldown  = 180 # 3 minutes - cautious scale-in
    scale_out_cooldown = 60  # 1 minute - fast scale-out
  }
}

# Target Tracking Policy: Request Count Per Target
resource "aws_appautoscaling_policy" "request_count" {
  name               = "${var.app_name}-request-count-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.main.arn_suffix}/${aws_lb_target_group.main.arn_suffix}"
    }

    target_value       = 80.0
    scale_in_cooldown  = 180
    scale_out_cooldown = 60
  }
}

# ============================================================================
# 8. CloudWatch Alarms
# ============================================================================

# Redis Memory Alarm
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.app_name}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Redis memory usage above 80%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.redis.id
  }

  alarm_actions = [] # TODO: Add SNS topic ARN for notifications
}

# Redis CPU Alarm
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.app_name}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "70"
  alarm_description   = "Redis CPU usage above 70%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.redis.id
  }

  alarm_actions = [] # TODO: Add SNS topic ARN
}

# ECS Service CPU Alarm
resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  alarm_name          = "${var.app_name}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "ECS service CPU usage above 80%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = [] # TODO: Add SNS topic ARN
}

# ALB 5xx Error Rate Alarm
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.app_name}-alb-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "ALB target 5xx errors above threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.main.arn_suffix
  }

  alarm_actions = [] # TODO: Add SNS topic ARN
}

# ============================================================================
# 9. IAM Roles
# ============================================================================

# ECS Task Execution Role (for pulling images, secrets)
resource "aws_iam_role" "ecs_execution" {
  name = "${var.app_name}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Additional policy for Secrets Manager access
resource "aws_iam_role_policy" "ecs_secrets" {
  name = "${var.app_name}-ecs-secrets-policy"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          "arn:aws:secretsmanager:*:*:secret:piza/*"
        ]
      }
    ]
  })
}

# ECS Task Role (for application runtime permissions)
resource "aws_iam_role" "ecs_task" {
  name = "${var.app_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# ============================================================================
# 10. CloudWatch Logs
# ============================================================================

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 7 # Adjust based on compliance needs

  tags = {
    Name        = "${var.app_name}-logs"
    Environment = var.environment
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# ============================================================================
# Outputs
# ============================================================================

output "alb_dns_name" {
  description = "ALB DNS name for DNS configuration"
  value       = aws_lb.main.dns_name
}

output "redis_endpoint" {
  description = "Redis endpoint for REDIS_URL"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.app.name
}
