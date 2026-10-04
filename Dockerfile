# One image with the API (Bun, :4000 inside) and the web app (Next standalone, :3000 exposed).
# Build from the repository root: docker build -t chordtune .

FROM oven/bun:1.4.2 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
RUN cd apps/web && bunx next build \
  && cp -r public .next/standalone/apps/web/ \
  && mkdir -p .next/standalone/apps/web/.next \
  && cp -r .next/static .next/standalone/apps/web/.next/

FROM oven/bun:1.4.2 AS api-deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/audio/package.json packages/audio/
COPY packages/chord-sheet/package.json packages/chord-sheet/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN bun install --production --filter @chordtune/api

FROM oven/bun:1.4.2 AS bun

FROM node:24-slim
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY --from=api-deps /repo/node_modules ./node_modules
COPY --from=api-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY apps/api ./apps/api
COPY packages/chord-sheet ./packages/chord-sheet
COPY packages/tsconfig ./packages/tsconfig
COPY --from=build /repo/apps/web/.next/standalone ./web
COPY docker/start.sh ./start.sh
ENV NODE_ENV=production
EXPOSE 3000
CMD ["./start.sh"]
