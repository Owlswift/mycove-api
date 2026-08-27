## Single dependency install, reused for both build and runtime. Prisma 7
## resolves its datasource URL through prisma.config.ts (a TS file) even for
## `migrate deploy`, so `prisma`/`typescript`/`ts-node` — all devDependencies
## — have to be present at runtime too; there's no clean way to ship only a
## "production" node_modules for this app without breaking migrations.
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package*.json ./

EXPOSE 3000

# Applies any pending migrations before every start — safe to run on an
# already-up-to-date schema (no-op), and means a fresh deploy never needs a
# manual migrate step.
CMD ["sh", "-c", "npx prisma migrate deploy && node --enable-source-maps dist/src/main.js"]
