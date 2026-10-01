# ========================================================
# DOBBLE BACKEND V1 - Production Dockerfile
# ========================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json tsconfig.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Generate Prisma client and compile
RUN npx prisma generate || true

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime dependencies for alpine
RUN apk add --no-cache curl

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production

# Copy source files (using tsx runtime for instant execution and high throughput)
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Expose HTTP and WebSocket port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start DOBBLE BACKEND V1
CMD ["npx", "tsx", "src/server.ts"]
