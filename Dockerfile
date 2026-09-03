# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.13.0-slim

FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
# Prisma 7 validates DATABASE_URL while generating the client; this value is
# used only in build stages and is not inherited by the runner stage.
ENV DATABASE_URL=mysql://school:build@127.0.0.1:3306/school
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL=mysql://school:build@127.0.0.1:3306/school
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run db:generate && npm run build

FROM builder AS production-dependencies

RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

ARG BUILD_SHA=unknown
LABEL org.opencontainers.image.revision=$BUILD_SHA

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/src/generated/prisma ./src/generated/prisma

RUN mkdir -p /app/.next/cache \
  && chown -R node:node /app/.next /app/public /app/src

# Fail the image build if the production platform cannot load Argon2.
RUN node -e 'const argon2 = require("argon2"); if (typeof argon2.verify !== "function") process.exit(1)'

USER node

EXPOSE 3000

CMD ["node", "server.js"]
