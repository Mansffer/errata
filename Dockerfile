# Stage 1: Build the application
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy dependency manifests and local packages first for layer caching
COPY package.json bun.lockb* ./
COPY packages/ ./packages/

# Install dependencies
RUN bun install

# Copy the rest of the application files
COPY . .

# Build the production bundle
RUN bun run build

# Stage 2: Runtime stage
FROM oven/bun:1-slim AS runner

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7739
ENV DATA_DIR=/app/data
ENV PLUGIN_DIR=/app/plugins

# Create directories for persistent data
RUN mkdir -p /app/data /app/plugins

# Copy the built output from builder stage
COPY --from=builder /app/.output /app/.output

# Expose port
EXPOSE 7739

# Define mount points for persistent volumes
VOLUME ["/app/data", "/app/plugins"]

# Start the application server
CMD ["bun", ".output/server/index.mjs"]
