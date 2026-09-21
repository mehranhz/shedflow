# Build from monorepo root:
#   docker build -f apps/billing/Dockerfile .
#
# Runtime: BILLING_PORT (default 3002), DATABASE_URL, JWT_SECRET, STRIPE_*, INTERNAL_API_SECRET

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
 && pnpm --filter @shedflow/billing build

FROM node:22-alpine AS runner
RUN addgroup -S shedflow && adduser -S shedflow -G shedflow
WORKDIR /app
ENV NODE_ENV=production
ENV BILLING_PORT=3002

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/billing/package.json ./apps/billing/
COPY --from=build /app/apps/billing/dist ./apps/billing/dist
COPY --from=build /app/apps/billing/node_modules ./apps/billing/node_modules
COPY --from=build /app/packages ./packages

USER shedflow
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health || exit 1
CMD ["node", "apps/billing/dist/main.js"]
