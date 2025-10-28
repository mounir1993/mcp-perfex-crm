# Multi-stage build for optimal production image
# Stage 1: Build stage
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files - explicitly include package-lock.json
COPY package.json package-lock.json ./

# Clear npm cache and install ALL dependencies
RUN npm cache clean --force
RUN npm install --include=dev --verbose

# Verify installation worked
RUN ls -la node_modules/.bin/ | head -10
RUN npm list --depth=0

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code and normalize line endings for Linux
COPY src/ ./src/

# Install dos2unix for line ending conversion and normalize line endings
RUN apk add --no-cache dos2unix && \
    find ./src -type f -name "*.ts" -exec dos2unix {} \; && \
    dos2unix tsconfig.json

# Build the application - verify tsc is available first
RUN npx tsc --version
RUN npx tsc

# Stage 2: Production stage
FROM node:22-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
# Use npm install instead of npm ci for better error handling
RUN npm cache clean --force && \
    npm install --omit=dev --verbose && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Set default server mode to HTTP for web integrations
ENV SERVER_MODE=http

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check')" || exit 1

# Start the application
# Use environment variable to choose between MCP or HTTP mode
CMD ["sh", "-c", "if [ \"$SERVER_MODE\" = \"http\" ]; then node dist/http-server.js; else node dist/index.js; fi"]