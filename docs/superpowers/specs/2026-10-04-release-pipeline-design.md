# Release pipeline design

## Goal

Pushing a version tag publishes the whole product: one Docker image with the API and the web app on
GitHub Container Registry, and a signed Android APK attached to a GitHub Release. A local
`bun run release` command picks the next version, commits it, tags it and pushes, which is the only
way a release starts.

## Decisions

- One image runs both the API and the web app; only the web port is exposed.
- The web app reaches the API on its own origin: Next proxies `/trpc/*` and `/api/auth/*` to the API
  inside the container. The image is not tied to a domain.
- The APK is signed with a release key kept in GitHub Secrets, so every release installs over the
  previous one and the same key can later be used for Google Play.
- The image is built for `linux/amd64` only.
- The version lives in the root `package.json`; Android's `versionName`/`versionCode` are derived
  from it at build time and never committed.

## Workflow: `.github/workflows/release.yml`

Triggered by `push` of tags matching `v*`. The version is the tag without the `v`.

1. **checks** — `bun install --frozen-lockfile`, `bun run lint`, `bun run check-types`,
   `bun run test`. The other jobs need it, so a broken commit publishes nothing.
2. **docker** — logs in to `ghcr.io` with `GITHUB_TOKEN` (`packages: write`), builds the root
   `Dockerfile` with Buildx and pushes `ghcr.io/brofrong/chordtune:<version>` and `:latest`.
3. **android** — builds and signs the APK and publishes the release (see below);
   needs `contents: write`.

## Docker image

The root `Dockerfile` replaces `apps/api/Dockerfile`.

- **Build stage** (Bun): install the workspace, run `next build` for the web build target with
  `output: 'standalone'` and `outputFileTracingRoot` at the repository root, then copy `public` and
  `.next/static` next to the standalone `server.js`.
- **Runtime stage**: Node 24 for the Next standalone server plus the Bun binary for the API. It
  holds the standalone web output and `apps/api` with its production dependencies and `drizzle`
  migrations.
- **Start script**: runs the API (`bun src/index.ts`, port 4000, internal) and the web server
  (`node server.js`, port 3000, exposed). When either process exits the script stops the other and
  exits non-zero, so the orchestrator restarts the container.
- **Runtime environment**: `DATABASE_URL`, `BETTER_AUTH_URL` (the public URL), `WEB_ORIGINS`
  (including the Capacitor origins), `MEILI_URL`, `MEILI_KEY`. The API applies migrations and
  creates its auth secret on start.

## Same-origin API access

- `next.config.ts`, web build only: rewrites `/trpc/:path*` and `/api/auth/:path*` to
  `http://localhost:4000`. This also applies to `bun run dev`.
- `apps/web/src/lib/api.ts` resolves the API base URL:
  - web build, browser: `''` (same origin);
  - web build, server: `http://localhost:4000`;
  - Capacitor build: `NEXT_PUBLIC_API_URL`, required.
- Auth cookies are then set on the site's own origin. `BETTER_AUTH_URL` is the public URL.

## Android

- Job steps: JDK 21, Bun, `bun install`, `NEXT_PUBLIC_API_URL=${{ vars.PUBLIC_URL }} bun run
  build:cap`, `bunx cap sync android`, decode the keystore, `./gradlew assembleRelease
  -PversionName=<version> -PversionCode=<code>`.
- `versionCode = major * 10000 + minor * 100 + patch`; minor and patch must stay below 100.
- `apps/web/android/app/build.gradle`:
  - reads `versionName`/`versionCode` from Gradle properties, defaulting to the current values;
  - defines a release signing config only when `ANDROID_KEYSTORE_PATH` and the password variables
    are set, so local builds keep working.
- `gh release create v<version> --generate-notes` with the APK attached as
  `ChordTune-<version>.apk`.
- Repository configuration:
  - secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
    `ANDROID_KEY_PASSWORD`;
  - variable: `PUBLIC_URL`.
- `scripts/android-keystore.sh` creates the keystore once with `keytool` and prints the
  `gh secret set` / `gh variable set` commands. The keystore never enters git; losing it means
  installed apps can no longer be updated.

## Release script: `scripts/release.ts`

Run with `bun run release` from the root.

1. Refuses to continue unless on `main`, the working tree is clean and `main` matches `origin/main`
   after a fetch.
2. Reads the version from the root `package.json` and offers patch, minor and major with the
   resulting versions.
3. After confirmation writes the version, commits `Release v<version>`, creates an annotated tag
   `v<version>` and pushes the commit and the tag.

## Out of scope

iOS builds, arm64 images, Google Play upload (AAB), deployment of the image.

## Testing

- `release.ts`: the version bump and `versionCode` calculation are pure functions with unit tests;
  the git steps are checked by a dry run.
- `lib/api.ts`: unit tests for each build target and environment.
- Docker: build the image locally, run it against the local Postgres and Meilisearch, and check
  that `/api/auth/get-session` and `/trpc/songs.list` answer through port 3000, then sign in and
  open the song list.
- Android: `assembleRelease` locally with a throwaway keystore; the workflow itself is checked on
  the first real tag.
