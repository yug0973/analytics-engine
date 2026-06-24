# ─────────────────────────────────────────────────────────
#  Multi-stage Dockerfile for the Node.js API server
#
#  Stage 1 (deps):        install ALL dependencies
#  Stage 2 (development): adds nodemon for hot reload
#  Stage 3 (production):  copies only prod deps, runs as
#                         non-root user, minimal attack surface
# ─────────────────────────────────────────────────────────

FROM node:20-alpine AS deps
WORKDIR /app
# Copy manifests first — Docker layer cache means npm ci
# only re-runs when package.json or lockfile changes
COPY package*.json ./
RUN npm ci

# ── Development stage ────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
# nodemon enables hot-reload when src/ is volume-mounted
CMD ["npm", "run", "dev"]

# ── Production build stage ───────────────────────────────
FROM node:20-alpine AS production-deps
WORKDIR /app
COPY package*.json ./
# --omit=dev excludes devDependencies → smaller final image
RUN npm ci --omit=dev

FROM node:20-alpine AS production
WORKDIR /app

# Copy only production dependencies
COPY --from=production-deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# Security: do not run as root
# The 'node' user already exists in the node:alpine image
RUN chown -R node:node /app
USER node

# Expose only the app port (not Kafka/Postgres ports — they're internal)
EXPOSE 3001

CMD ["node", "src/index.js"]