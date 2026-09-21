# Build from monorepo root:
#   docker build -f apps/worker/Dockerfile .
#
# Runtime: WORKER_PORT (default 3003), DATABASE_URL, INTERNAL_API_SECRET, API_URL, EMAIL_FROM

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/billing/package.json apps/billing/
COPY apps/worker/package.json apps/worker/
COPY apps/client/package.json apps/client/
COPY apps/embed/package.json apps/embed/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/emails/package.json packages/emails/
COPY packages/ui/package.json packages/ui/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm rebuild bcrypt \
 && pnpm --filter @shedflow/db build \
 && pnpm --filter @shedflow/shared build \
 && pnpm --filter @shedflow/emails build \
 && pnpm --filter @shedflow/worker build

FROM node:22-alpine AS runner
RUN addgroup -S shedflow && adduser -S shedflow -G shedflow
WORKDIR /app
ENV NODE_ENV=production
ENV WORKER_PORT=3003

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/package.json ./apps/worker/
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /app/packages ./packages

USER shedflow
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/health || exit 1
CMD ["node", "apps/worker/dist/main.js"]
