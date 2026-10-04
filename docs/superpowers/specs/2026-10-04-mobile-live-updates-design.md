# Mobile live updates design

## Goal

An installed mobile app picks up new web code after a release without reinstalling the APK. The
code it gets is the code that matches the deployed server, so the app never runs ahead of the API
it calls. A broken bundle rolls back by itself. Web code that needs a newer native shell is never
applied; the app points the user at the new APK instead.

## Decisions

- Plugin: `@capgo/capacitor-updater` (8.x, Capacitor 8) in manual mode, without Capgo's cloud.
- Bundles are served by our own server: the Docker image carries the Capacitor bundle of its own
  commit, so phones follow the deployed server, including rollbacks.
- A downloaded bundle is applied when the user taps "Restart" on a banner, or otherwise the next
  time the app goes to the background or restarts.
- Compatibility with the native shell is decided by a fingerprint of the native layer, computed
  automatically.
- When the native shell is too old, a banner links to the latest GitHub Release.
- iOS is out of scope; nothing here is Android-specific except the fingerprint inputs.

## Native fingerprint

`scripts/native-fingerprint.ts` computes a sha256 over what defines the JS-to-native contract:

- `apps/web/capacitor.config.ts`;
- `apps/web/android/app/src/main/AndroidManifest.xml` (permissions);
- the installed versions of `@capacitor/*` and `@capgo/*` packages that `apps/web/package.json`
  depends on, read from `node_modules`.

Icons, Gradle settings and other native files are left out so they do not stop live updates for
no reason. The inputs are sorted and labelled before hashing so the result is stable.

## Build

`next.config.ts`, Capacitor build only, adds two constants:

- `NEXT_PUBLIC_APP_VERSION`: the version from the root `package.json`;
- `NEXT_PUBLIC_NATIVE_FINGERPRINT`: the native fingerprint.

The APK built by CI and the bundle built into the Docker image both get them this way, so a fresh
APK and the image of the same tag agree and the fresh install downloads nothing.

## Serving

The Docker build stage:

1. builds the web app as today and moves the standalone output aside;
2. when the `PUBLIC_URL` build argument is set, builds the Capacitor export with
   `NEXT_PUBLIC_API_URL=$PUBLIC_URL`;
3. zips `out/` with `index.html` at the root into `public/mobile/<version>.zip` of the standalone
   output and writes `public/mobile/update.json`:

```json
{ "version": "0.1.2", "url": "/mobile/0.1.2.zip", "checksum": "<sha256 of the zip>", "nativeFingerprint": "<hash>" }
```

`url` is relative to the manifest's origin. Next serves both files as static assets; the API does
not change. Without `PUBLIC_URL` (a local `docker build`) the image has no mobile bundle and the
app sees a 404, which means "no update".

`scripts/mobile-bundle.ts` writes the zip and the manifest; the Dockerfile calls it.

## App

`capacitor.config.ts`, `plugins.CapacitorUpdater`:

- `autoUpdate: 'off'`: our code decides when to check;
- `statsUrl: ''`: the plugin otherwise reports stats, crashes and JS errors to `plugin.capgo.app`;
- `keepUrlPathAfterReload: true`: a restart reopens the same page.

`src/lib/app-update.ts`:

- `decideUpdate({ manifest, version, fingerprint })` is pure and returns:
  - `none`: the manifest is missing or invalid, or its version equals the bundle's own;
  - `needs-native`: the version differs and the fingerprint differs;
  - `download`: the version differs and the fingerprint matches.
  Any difference in version counts, not only a newer one, so the app follows a server rollback.
- `useAppUpdate()` runs only when `Capacitor.isNativePlatform()`:
  1. calls `CapacitorUpdater.notifyAppReady()` on mount, before any request; a bundle that does
     not reach it within the plugin's 10 s timeout is rolled back by the plugin;
  2. on start and whenever the app becomes visible, fetches `${API_URL}/mobile/update.json` with
     `cache: 'no-store'`;
  3. `download`: `CapacitorUpdater.download({ url, version, checksum })`, then `next({ id })`,
     then state `ready`; the plugin applies it on backgrounding or restart;
  4. `needs-native`: state `needs-native`;
  5. network errors, non-200 answers and malformed manifests leave the state unchanged and show
     nothing; a failed download is retried on the next check;
  6. a download for a version already downloaded in this session is not repeated;
  7. a version that failed on this device is never downloaded again. Before `next()` the app stores
     `{ version, from }` in `localStorage` as pending, `from` being its own version. On start, after
     `notifyAppReady()` resolves:
     - own version equals `version`: the update worked, pending is cleared;
     - own version equals `from`: the plugin rolled the update back, `version` moves to a failed
       list and pending is cleared;
     - anything else (a new APK was installed meanwhile): pending is cleared.
     Otherwise a broken release would download, roll back and download again on every start.

`decideUpdate` takes the failed list and answers `none` for a failed version. The manifest's `url`
is resolved against the manifest's own URL.

The bundle's own version and fingerprint come from the constants, not from the plugin, which
reports `builtin` for the bundle inside the APK. The constants are enough: a bundle with another
fingerprint is never applied, and installing a new APK resets the plugin to the built-in bundle
(`resetWhenUpdate`, on by default).

`src/components/app-update-banner.tsx`, mounted in the app shell, shows:

- `ready`: "Update ready" with "Restart" (`CapacitorUpdater.reload()`) and "Later" (hides the
  banner; the update still applies on backgrounding);
- `needs-native`: "A new version of the app is available" with "Download", opening
  `https://github.com/brofrong/chordtune/releases/latest` in the system browser, and "Later",
  which hides it until the next launch.

Texts are in `messages/ru.json` and `messages/en.json`.

## CI

- `docker` job: `build-args: PUBLIC_URL=${{ vars.PUBLIC_URL }}`.
- `.dockerignore` lets `apps/web/android/app/src/main/AndroidManifest.xml` into the context.
- `android` job: unchanged; `cap sync` adds the plugin to the APK.

## Release flow

`bun run release` → CI publishes the image and the APK → the server is updated
(`docker compose pull && docker compose up -d`) → apps fetch the new bundle on their next start or
return to the foreground.

The first APK with the plugin has to be installed by hand once; v0.1.0 has neither the plugin nor
the right API address.

## Testing

- Unit tests:
  - `decideUpdate`: same version, other version in both directions, other fingerprint, missing or
    malformed manifest;
  - fingerprint: stable for the same inputs, changes with a plugin version, the Capacitor config
    or the Android manifest, ignores unrelated files;
  - `mobile-bundle`: the zip has `index.html` at the root, the manifest's checksum and URL match.
- Docker: the image builds with and without `PUBLIC_URL`; with it, `/mobile/update.json` and the
  zip are served.
- End to end on an Android emulator against a local server: banner and "Restart"; "Later" then
  backgrounding; rollback of a bundle that never calls `notifyAppReady`; the needs-native banner.

## Out of scope

iOS, delta updates, bundle signing or encryption, staged rollouts, update channels.
