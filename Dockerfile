# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS api-build
COPY apps/api apps/api
COPY packages/database packages/database
RUN npx prisma generate --schema packages/database/prisma/schema.prisma
RUN npm --workspace @torito/api run build

FROM base AS api-production-dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --workspace @torito/api --include-workspace-root=false \
  && npm cache clean --force

FROM base AS api
ENV NODE_ENV=production \
    PORT=4070
COPY --from=api-production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=api-build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=api-build --chown=node:node /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 4070
CMD ["node", "apps/api/dist/main.js"]

FROM dependencies AS migrate
ENV NODE_ENV=production
COPY --chown=node:node packages/database packages/database
RUN npx prisma generate --schema packages/database/prisma/schema.prisma
USER node

FROM dependencies AS web-build
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_SITE_URL="https://toritofresh.com"
ARG NEXT_PUBLIC_WHATSAPP_NUMBER="51999999999"
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_WHATSAPP_NUMBER=${NEXT_PUBLIC_WHATSAPP_NUMBER}
COPY apps/web apps/web
RUN npm --workspace @torito/web run build

FROM node:${NODE_VERSION}-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3070
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3070
CMD ["node", "apps/web/server.js"]
