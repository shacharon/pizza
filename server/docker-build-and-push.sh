#!/bin/bash

# ============================================
# Build and Push Docker Image to AWS ECR
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPOSITORY="${ECR_REPOSITORY:-pizza-backend}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo -e "${GREEN}🚀 Pizza Backend - Docker Build & Push to ECR${NC}"
echo "================================================"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed. Please install it first.${NC}"
    echo "Visit: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Get AWS account ID
echo -e "${YELLOW}📋 Getting AWS account information...${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}❌ Failed to get AWS account ID. Please check your AWS credentials.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ AWS Account ID: $AWS_ACCOUNT_ID${NC}"

# Construct ECR URI
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}"

# Login to ECR
echo ""
echo -e "${YELLOW}🔑 Logging in to Amazon ECR...${NC}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to login to ECR${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Successfully logged in to ECR${NC}"

# Build Docker image
echo ""
echo -e "${YELLOW}🔨 Building Docker image...${NC}"
echo "Image: $ECR_REPOSITORY:$IMAGE_TAG"
docker build -t "$ECR_REPOSITORY:$IMAGE_TAG" -f Dockerfile ..
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker image built successfully${NC}"

# Tag image for ECR
echo ""
echo -e "${YELLOW}🏷️  Tagging image for ECR...${NC}"
docker tag "$ECR_REPOSITORY:$IMAGE_TAG" "$ECR_URI:$IMAGE_TAG"
echo -e "${GREEN}✓ Image tagged: $ECR_URI:$IMAGE_TAG${NC}"

# Also tag as latest if not already
if [ "$IMAGE_TAG" != "latest" ]; then
    docker tag "$ECR_REPOSITORY:$IMAGE_TAG" "$ECR_URI:latest"
    echo -e "${GREEN}✓ Image also tagged as: $ECR_URI:latest${NC}"
fi

# Push to ECR
echo ""
echo -e "${YELLOW}📤 Pushing image to ECR...${NC}"
docker push "$ECR_URI:$IMAGE_TAG"
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to push image to ECR${NC}"
    exit 1
fi

if [ "$IMAGE_TAG" != "latest" ]; then
    docker push "$ECR_URI:latest"
fi

echo ""
echo -e "${GREEN}✅ Successfully pushed image to ECR!${NC}"
echo ""
echo "Image URI: $ECR_URI:$IMAGE_TAG"
echo ""
echo "Next steps:"
echo "1. Update ECS task definition with this image URI"
echo "2. Deploy to ECS: aws ecs update-service --cluster pizza-app-cluster --service pizza-backend-service --force-new-deployment"
echo ""
