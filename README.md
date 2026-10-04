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
docker build --build-arg PUBLIC_URL=https://your.domain -t chordtune .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://… -e BETTER_AUTH_URL=https://your.domain \
  -e WEB_ORIGINS=https://your.domain,capacitor://localhost,https://localhost \
  -e MEILI_URL=http://… -e MEILI_KEY=… chordtune
```

With `PUBLIC_URL` the image also carries the mobile bundle of its commit at
`/mobile/update.json` and `/mobile/<version>.zip`; without it there are no live updates.

## Deploy

`deploy/` runs the published image with Postgres and Meilisearch. The app listens on
`127.0.0.1:3000` for a reverse proxy on the host, which serves the domain over HTTPS and sets
`X-Forwarded-For` to the client address. Copy the directory to the server and:

```sh
cp .env.example .env          # domain, image version, passwords
docker compose up -d
docker compose exec app sh -c 'cd /app/apps/api && bun src/scripts/reindex.ts'   # rebuild search from Postgres
```

## Release

```sh
bun run release               # pick patch/minor/major, commit, tag and push
```

A pushed `v*` tag runs `.github/workflows/release.yml`: checks, then the Docker image
`ghcr.io/brofrong/chordtune:<version>` and a signed APK on the GitHub Release. One-time setup:
`scripts/android-keystore.sh` creates the release key and prints the `gh secret set` commands, and
the `PUBLIC_URL` repository variable is the address the Android app talks to.

With the `ARCANE_WEBHOOK_URL` secret set to an Arcane "redeploy project" webhook, the `docker` job
then tells Arcane to pull the new image and restart the `deploy/` project, which must run
`CHORDTUNE_VERSION=latest`.

Installed apps follow the server: once it runs the new image, they download its mobile bundle on
their next start or return to the foreground, offer a restart and otherwise switch when sent to
the background. A bundle that fails to start is rolled back and not tried again. When the native
layer changed (Capacitor plugins, `capacitor.config.ts`, `AndroidManifest.xml`), apps get no
bundle and offer the new APK instead.
