# ==============================================================================
# 👑 ROYAL LUDO 3D — PRODUCTION BACKEND DOCKERFILE
# Multi-stage build for minimal image size, high security, and fast boot
# ==============================================================================

# STAGE 1: Build & Compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code and database migrations
COPY src ./src

# Compile TypeScript and copy SQL schema
RUN npm run build

# Prune devDependencies to keep production layer small
RUN npm prune --production

# STAGE 2: Lightweight Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Run as non-root node user for security hardening
USER node

# Copy compiled artifacts and production dependencies from builder
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

# Start authoritative server
CMD ["node", "dist/index.js"]
