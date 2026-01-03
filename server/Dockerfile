# ============================================
# Production Dockerfile for Pizza Backend
# Build context: Repository root (.)
# ============================================

# ---------------------------------------------
# Stage 1: Builder
# ---------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /build

# Copy package files from server directory
COPY server/package*.json ./server/

# Install all dependencies (including devDependencies for TypeScript build)
WORKDIR /build/server
RUN npm ci

# Copy TypeScript config and source files
WORKDIR /build
COPY tsconfig.base.json ./
COPY server/tsconfig.json ./server/
COPY server/src/ ./server/src/
COPY shared/ ./shared/

# Build TypeScript - outputs to server/dist/
WORKDIR /build/server
RUN npm run build

# ---------------------------------------------
# Stage 2: Production
# ---------------------------------------------
FROM node:24-alpine

# Metadata
LABEL maintainer="Pizza App Team"
LABEL version="1.0"
LABEL description="Pizza ordering backend with LLM integration"

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY server/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /build/server/dist ./dist

# Set ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3000

# Health check - verifies /healthz endpoint every 30 seconds
HEALTHCHECK --interval=30s \
            --timeout=5s \
            --start-period=10s \
            --retries=3 \
            CMD curl -f http://localhost:3000/healthz || exit 1

# Start the application
# Entry point: dist/server/src/server.js
# (TypeScript preserves directory structure from rootDir)
CMD ["node", "dist/server/src/server.js"]
