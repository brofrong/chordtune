# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM oven/bun:1.4 AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN bun install --production --filter @chordtune/api

FROM oven/bun:1.4
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY apps/api ./apps/api
WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["bun", "src/index.ts"]
