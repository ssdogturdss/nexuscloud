# ─────────────────────────────────────────────────────────────────────────────
# NexusCloud — multi-stage Docker build
#
# Stage 1 (builder): installs all deps, builds the React panel and API server.
# Stage 2 (production): copies only the compiled output; runs as a non-root
#   user.  No dev tooling or source files reach the final image.
#
# Build:
#   docker build -t nexuscloud .
#
# Run:
#   docker run -p 8080:8080 --env-file .env nexuscloud
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# pnpm is our package manager
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests first so Docker can cache the install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tsconfig.json tsconfig.base.json ./

# Lib manifests
COPY lib/db/package.json          lib/db/
COPY lib/api-spec/package.json    lib/api-spec/
COPY lib/api-zod/package.json     lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/

# Artifact manifests
COPY artifacts/api-server/package.json   artifacts/api-server/
COPY artifacts/cloud-panel/package.json  artifacts/cloud-panel/

# Install all dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy all source
COPY lib/         lib/
COPY artifacts/   artifacts/
COPY agent/       agent/

# Build the API server (which also builds the React panel internally)
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: production ───────────────────────────────────────────────────────
FROM node:20-slim AS production

RUN npm install -g pnpm@9

# Create a non-root user
RUN addgroup --system nexus && adduser --system --ingroup nexus nexus

WORKDIR /app

# The server bundle includes all JavaScript dependencies and static assets.
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Drop privileges
USER nexus

EXPOSE 8080

ENV NODE_ENV=production \
    PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/healthz', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
