# ============================================
# Build and Push Docker Image to AWS ECR (PowerShell)
# ============================================

param(
    [string]$AwsRegion = "us-east-1",
    [string]$EcrRepository = "pizza-backend",
    [string]$ImageTag = "latest"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Pizza Backend - Docker Build & Push to ECR" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

# Check if AWS CLI is installed
try {
    $null = Get-Command aws -ErrorAction Stop
} catch {
    Write-Host "❌ AWS CLI is not installed. Please install it first." -ForegroundColor Red
    Write-Host "Visit: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is running
try {
    $null = docker info 2>&1
} catch {
    Write-Host "❌ Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Get AWS account ID
Write-Host "📋 Getting AWS account information..." -ForegroundColor Yellow
try {
    $AwsAccountId = aws sts get-caller-identity --query Account --output text
    if ([string]::IsNullOrEmpty($AwsAccountId)) {
        throw "Failed to get account ID"
    }
    Write-Host "✓ AWS Account ID: $AwsAccountId" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get AWS account ID. Please check your AWS credentials." -ForegroundColor Red
    exit 1
}

# Construct ECR URI
$EcrUri = "$AwsAccountId.dkr.ecr.$AwsRegion.amazonaws.com/$EcrRepository"

# Login to ECR
Write-Host ""
Write-Host "🔑 Logging in to Amazon ECR..." -ForegroundColor Yellow
try {
    $loginPassword = aws ecr get-login-password --region $AwsRegion
    $loginPassword | docker login --username AWS --password-stdin "$AwsAccountId.dkr.ecr.$AwsRegion.amazonaws.com"
    Write-Host "✓ Successfully logged in to ECR" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to login to ECR" -ForegroundColor Red
    exit 1
}

# Build Docker image
Write-Host ""
Write-Host "🔨 Building Docker image..." -ForegroundColor Yellow
Write-Host "Image: $EcrRepository`:$ImageTag"
try {
    docker build -t "$EcrRepository`:$ImageTag" -f Dockerfile ..
    Write-Host "✓ Docker image built successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker build failed" -ForegroundColor Red
    exit 1
}

# Tag image for ECR
Write-Host ""
Write-Host "🏷️  Tagging image for ECR..." -ForegroundColor Yellow
docker tag "$EcrRepository`:$ImageTag" "$EcrUri`:$ImageTag"
Write-Host "✓ Image tagged: $EcrUri`:$ImageTag" -ForegroundColor Green

# Also tag as latest if not already
if ($ImageTag -ne "latest") {
    docker tag "$EcrRepository`:$ImageTag" "$EcrUri`:latest"
    Write-Host "✓ Image also tagged as: $EcrUri`:latest" -ForegroundColor Green
}

# Push to ECR
Write-Host ""
Write-Host "📤 Pushing image to ECR..." -ForegroundColor Yellow
try {
    docker push "$EcrUri`:$ImageTag"
    if ($ImageTag -ne "latest") {
        docker push "$EcrUri`:latest"
    }
    Write-Host ""
    Write-Host "✅ Successfully pushed image to ECR!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to push image to ECR" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Image URI: $EcrUri`:$ImageTag" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update ECS task definition with this image URI"
Write-Host "2. Deploy to ECS: aws ecs update-service --cluster pizza-app-cluster --service pizza-backend-service --force-new-deployment"
Write-Host ""
