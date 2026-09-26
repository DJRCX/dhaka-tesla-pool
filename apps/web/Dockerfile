# syntax=docker/dockerfile:1
#
# Next.js standalone web image.
# API_INTERNAL_URL is baked into /api/* rewrites at `next build` time (see
# apps/web/next.config.ts). Pass the same value as build-arg and runtime ENV.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY --from=deps /app/apps/api/package.json ./apps/api/
COPY --from=deps /app/apps/web/package.json ./apps/web/
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build -w @teslapool/shared \
  && npm run build -w @teslapool/web \
  && test -f apps/web/.next/standalone/apps/web/server.js

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Documented for operators; rewrite target was fixed at build time.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN addgroup -S teslapool && adduser -S teslapool -G teslapool \
  && apk add --no-cache wget
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER teslapool
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=5s --retries=12 --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
