# ─── Stage 1: install production dependencies ────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app
# pnpm-workspace.yaml carries the build-script approvals (allowBuilds) — required,
# or pnpm 11 aborts with ERR_PNPM_IGNORED_BUILDS.
COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ─── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ─── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --chown=appuser:appgroup package.json ./
USER appuser
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/main"]
