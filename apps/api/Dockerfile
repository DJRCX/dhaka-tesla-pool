# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY --from=deps /app/apps/api/package.json ./apps/api/
COPY --from=deps /app/apps/web/package.json ./apps/web/
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build -w @teslapool/shared \
  && npm run build -w @teslapool/api \
  && test -f packages/shared/dist/index.js \
  && test -f apps/api/dist/server.js

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S teslapool && adduser -S teslapool -G teslapool
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/drizzle ./apps/api/drizzle
USER teslapool
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
