# syntax=docker/dockerfile:1.7

# ===== Stage 1: builder — instala deps + gera Prisma Client =====
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
COPY server/prisma ./prisma

RUN npm ci
RUN npx prisma generate

# ===== Stage 2: runtime =====
FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl tini wget

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=builder /app/server/node_modules /app/server/node_modules
COPY server /app/server
COPY public /app/public

WORKDIR /app/server

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
