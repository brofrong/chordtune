# ChordTune

Tuner and chord sheets for guitar players: web (Next.js) plus iOS/Android (Capacitor).

- `apps/web` — Next.js 16, Tailwind v4, shadcn/ui, next-intl (ru/en), Capacitor projects in `ios/` and `android/`
- `apps/api` — Hono + tRPC + Better Auth + Drizzle ORM 1.0 on Bun, deployable on its own (`apps/api/Dockerfile`)
- `packages/audio` — pitch detection, chord detection, tunings, AudioWorklet capture and analysis worker
- `docs/plans` — design and roadmap

## Setup

```sh
bun install
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -hex 32)
bun run db:up                 # Postgres in Docker
cd apps/api && bun run db:migrate && cd -
bun run dev                   # web on :3000, api on :4000
```

## Checks

```sh
bun run lint
bun run check-types
bun run test
```

## Mobile

```sh
cd apps/web
bun run cap:sync              # static export into out/ and copy into the native projects
bun run cap:ios               # open Xcode
bun run cap:android           # open Android Studio (uses its bundled JDK 21)
```

The web build uses SSR; `BUILD_TARGET=capacitor` switches Next.js to `output: 'export'`, so code shared by
both builds must not rely on proxy, route handlers, cookies or request headers.
