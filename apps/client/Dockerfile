# Build from monorepo root:
#   docker build -f apps/client/Dockerfile .

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
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV API_URL=http://api:3001
ENV AUTH_SECRET=build-time-placeholder
RUN pnpm --filter @shedflow/shared build \
 && pnpm --filter client build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "client", "start"]
