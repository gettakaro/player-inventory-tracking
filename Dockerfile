# ============================================
# Stage 1: Dependencies & Build
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for TypeScript build)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY src ./src
COPY public ./public
COPY tsconfig.json ./
COPY tsconfig.frontend.json ./
COPY esbuild.config.mjs ./

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Production Dependencies
# ============================================
FROM node:22-alpine AS deps

WORKDIR /app

COPY package*.json ./

# Install production dependencies only
RUN npm ci --legacy-peer-deps --omit=dev && \
    npm cache clean --force

# ============================================
# Stage 3: Runtime
# ============================================
FROM node:22-alpine AS runtime

# Build-time metadata (injected by CI)
ARG TAKARO_VERSION=unset
ARG TAKARO_COMMIT=unset
ARG TAKARO_BUILD_DATE=unset

ENV TAKARO_VERSION=${TAKARO_VERSION}
ENV TAKARO_COMMIT=${TAKARO_COMMIT}
ENV TAKARO_BUILD_DATE=${TAKARO_BUILD_DATE}
ENV NODE_ENV=production

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Create cache directory with proper permissions
RUN mkdir -p /app/cache && \
    chown -R appuser:nodejs /app

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/status || exit 1

# Start the application
CMD ["node", "dist/server.js"]
