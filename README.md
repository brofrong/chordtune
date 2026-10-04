# ChordTune

Tuner and chord sheets for guitar players: web (Next.js) plus iOS/Android (Capacitor).

- `apps/web` — Next.js 16, Tailwind v4, shadcn/ui, next-intl (ru/en), Capacitor projects in `ios/` and `android/`
- `apps/api` — Hono + tRPC + Better Auth + Drizzle ORM 1.0 on Bun
- `packages/audio` — pitch detection, chord detection, tunings, AudioWorklet capture and analysis worker
- `docs/plans` — design and roadmap

## Setup

```sh
bun install
cp .env.example .env
bun run db:up                 # Postgres in Docker
bun run dev                   # web on :3000, api on :4000
```

The API applies database migrations on start and generates its auth secret on first start, keeping
it in the `app_config` table.

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

## Docker

One image runs both the API and the web app; only port 3000 is exposed and Next forwards
`/trpc` and `/api/auth` to the API inside the container. Put it behind a reverse proxy that sets
`X-Forwarded-For`, so auth rate limiting sees client addresses.

```sh
docker build -t chordtune .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://… -e BETTER_AUTH_URL=https://your.domain \
  -e WEB_ORIGINS=https://your.domain,capacitor://localhost,https://localhost \
  -e MEILI_URL=http://… -e MEILI_KEY=… chordtune
```

## Release

```sh
bun run release               # pick patch/minor/major, commit, tag and push
```

A pushed `v*` tag runs `.github/workflows/release.yml`: checks, then the Docker image
`ghcr.io/brofrong/chordtune:<version>` and a signed APK on the GitHub Release. One-time setup:
`scripts/android-keystore.sh` creates the release key and prints the `gh secret set` commands, and
the `PUBLIC_URL` repository variable is the address the Android app talks to.
