# Mobile Live Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Installed Android apps download the web bundle of the deployed server and switch to it, rolling back broken bundles and pointing at a new APK when the native shell is too old.

**Architecture:** The Docker image builds the Capacitor export of its own commit and serves it as `/mobile/<version>.zip` plus `/mobile/update.json`. The app, through `@capgo/capacitor-updater` in manual mode, compares the manifest with constants baked into its bundle (version, native fingerprint), downloads, and applies on "Restart" or backgrounding.

**Tech Stack:** Bun, Next 16 static export, Capacitor 8, `@capgo/capacitor-updater` 8.x, `fflate` for zipping, GitHub Actions, Docker.

**Spec:** `docs/superpowers/specs/2026-10-04-mobile-live-updates-design.md`

## Global Constraints

- Plugin config: `autoUpdate: 'off'`, `statsUrl: ''`, `keepUrlPathAfterReload: true`.
- Manifest shape: `{ "version", "url", "checksum", "nativeFingerprint" }`; `url` is relative to the manifest (`/mobile/<version>.zip`); `checksum` is the lowercase sha256 hex of the zip.
- Fingerprint inputs: `apps/web/capacitor.config.ts`, `apps/web/android/app/src/main/AndroidManifest.xml`, installed versions of `@capacitor/*` and `@capgo/*` in `apps/web/package.json` `dependencies`.
- Any version difference counts (not only newer); a failed version is never downloaded again.
- APK link: `https://github.com/brofrong/chordtune/releases/latest`.
- `localStorage` keys: `chordtune.update.pending`, `chordtune.update.failed`.
- Without `PUBLIC_URL` the image builds without a mobile bundle.
- Next code: read `apps/web/node_modules/next/dist/docs` before writing Next-specific code (`apps/web/AGENTS.md`).

## Review Focus

- A broken bundle that never calls `notifyAppReady` → the plugin rolls back and the version is not downloaded again (Task 2 `settlePending` tests; Task 6 emulator check).
- A new APK installed while an update was pending → the pending version is not marked failed (Task 2 test "anything else clears").
- The server is unreachable, answers 404 or HTML → no banner, no error (Task 2 `parseManifest` tests for HTML/garbage).
- The server rolled back to an older version → the app follows (Task 2 test "older version downloads").
- The same commit built in Docker and in the APK job → identical fingerprint (Task 1 test that file order and unrelated files do not change it; Task 4 check that the image's manifest fingerprint equals a local computation).

---

### Task 1: Native fingerprint

**Files:**
- Create: `scripts/native-fingerprint.ts`
- Test: `scripts/native-fingerprint.test.ts`

**Interfaces:**
- Produces: `fingerprintOf(inputs: { capacitorConfig: string; androidManifest: string; plugins: Record<string, string> }): string` (64 hex chars) and `nativeFingerprint(webDir: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { fingerprintOf, nativeFingerprint } from './native-fingerprint';

const base = {
  capacitorConfig: 'config',
  androidManifest: '<manifest/>',
  plugins: { '@capacitor/core': '8.5.2', '@capacitor/haptics': '8.0.2' },
};

describe('fingerprintOf', () => {
  test('is a stable sha256', () => {
    expect(fingerprintOf(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf(base)).toBe(fingerprintOf({ ...base }));
  });

  test('does not depend on the order plugins are listed in', () => {
    const reversed = { '@capacitor/haptics': '8.0.2', '@capacitor/core': '8.5.2' };
    expect(fingerprintOf({ ...base, plugins: reversed })).toBe(fingerprintOf(base));
  });

  test('changes with a plugin version, a new plugin, the config or the Android manifest', () => {
    const changed = [
      { ...base, plugins: { ...base.plugins, '@capacitor/haptics': '8.0.3' } },
      { ...base, plugins: { ...base.plugins, '@capgo/capacitor-updater': '8.52.1' } },
      { ...base, capacitorConfig: 'config2' },
      { ...base, androidManifest: '<manifest a="1"/>' },
    ];
    for (const inputs of changed) {
      expect(fingerprintOf(inputs)).not.toBe(fingerprintOf(base));
    }
  });

  test('does not mix up inputs that only differ in where a boundary falls', () => {
    expect(fingerprintOf({ ...base, capacitorConfig: 'ab', androidManifest: 'c' })).not.toBe(
      fingerprintOf({ ...base, capacitorConfig: 'a', androidManifest: 'bc' }),
    );
  });
});

describe('nativeFingerprint', () => {
  test('reads the web app in this repository', () => {
    expect(nativeFingerprint(join(import.meta.dir, '../apps/web'))).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `bun test scripts/native-fingerprint.test.ts`, expect "Cannot find module".

- [ ] **Step 3: Implement**

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

type Inputs = { capacitorConfig: string; androidManifest: string; plugins: Record<string, string> };

/**
 * Identifies the native layer a web bundle was built against. A live update only goes to an app
 * whose shell has the same fingerprint; anything else needs a new APK.
 */
export function fingerprintOf({ capacitorConfig, androidManifest, plugins }: Inputs): string {
  const parts = [
    ['capacitor.config.ts', capacitorConfig],
    ['AndroidManifest.xml', androidManifest],
    ...Object.entries(plugins).sort(([a], [b]) => a.localeCompare(b)),
  ];
  // JSON keeps the boundaries between inputs unambiguous.
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** The fingerprint of the web app in `webDir`, with plugin versions as installed. */
export function nativeFingerprint(webDir: string): string {
  const pkg = JSON.parse(readFileSync(join(webDir, 'package.json'), 'utf8'));
  const require = createRequire(join(webDir, 'package.json'));
  const plugins = Object.fromEntries(
    Object.keys(pkg.dependencies ?? {})
      .filter((name) => /^@(capacitor|capgo)\//.test(name))
      .map((name) => [name, require(`${name}/package.json`).version as string]),
  );
  return fingerprintOf({
    capacitorConfig: readFileSync(join(webDir, 'capacitor.config.ts'), 'utf8'),
    androidManifest: readFileSync(join(webDir, 'android/app/src/main/AndroidManifest.xml'), 'utf8'),
    plugins,
  });
}
```

- [ ] **Step 4: Run to see it pass**; mutation check: drop `.sort(...)`, the order test fails; restore.
- [ ] **Step 5: Commit** `Compute a fingerprint of the native app layer`.

---

### Task 2: Update decision

**Files:**
- Create: `apps/web/src/lib/app-update.ts`
- Test: `apps/web/src/lib/app-update.test.ts`

**Interfaces:**
- Produces:
  - `type UpdateManifest = { version: string; url: string; checksum: string; nativeFingerprint: string }`
  - `parseManifest(value: unknown): UpdateManifest | null`
  - `type UpdateDecision = { kind: 'none' } | { kind: 'download'; manifest: UpdateManifest } | { kind: 'needs-native' }`
  - `decideUpdate(input: { manifest: UpdateManifest | null; version: string; fingerprint: string; failed: readonly string[] }): UpdateDecision`
  - `type PendingUpdate = { version: string; from: string }`
  - `parsePending(value: unknown): PendingUpdate | null`
  - `settlePending(pending: PendingUpdate | null, version: string): { failed: string | null }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'bun:test';

import { decideUpdate, parseManifest, parsePending, settlePending } from './app-update';

const manifest = { version: '0.2.0', url: '/mobile/0.2.0.zip', checksum: 'a'.repeat(64), nativeFingerprint: 'f1' };
const own = { version: '0.1.1', fingerprint: 'f1', failed: [] as string[] };

describe('parseManifest', () => {
  test('accepts a complete manifest', () => {
    expect(parseManifest(manifest)).toEqual(manifest);
  });

  test('rejects anything else, such as an HTML page or a partial object', () => {
    for (const value of [null, 'html', 42, {}, { ...manifest, version: 1 }, { ...manifest, checksum: undefined }]) {
      expect(parseManifest(value)).toBeNull();
    }
  });
});

describe('decideUpdate', () => {
  test('nothing to do without a manifest or for the same version', () => {
    expect(decideUpdate({ ...own, manifest: null })).toEqual({ kind: 'none' });
    expect(decideUpdate({ ...own, manifest: { ...manifest, version: '0.1.1' } })).toEqual({ kind: 'none' });
  });

  test('a newer version with the same native layer downloads', () => {
    expect(decideUpdate({ ...own, manifest })).toEqual({ kind: 'download', manifest });
  });

  test('an older version downloads too, so the app follows a server rollback', () => {
    const older = { ...manifest, version: '0.1.0' };
    expect(decideUpdate({ ...own, manifest: older })).toEqual({ kind: 'download', manifest: older });
  });

  test('another native layer needs a new APK', () => {
    expect(decideUpdate({ ...own, manifest: { ...manifest, nativeFingerprint: 'f2' } })).toEqual({ kind: 'needs-native' });
  });

  test('a version that failed on this device is not tried again', () => {
    expect(decideUpdate({ ...own, failed: ['0.2.0'], manifest })).toEqual({ kind: 'none' });
  });
});

describe('settlePending', () => {
  test('nothing pending, nothing failed', () => {
    expect(settlePending(null, '0.1.1')).toEqual({ failed: null });
  });

  test('running the pending version means it worked', () => {
    expect(settlePending({ version: '0.2.0', from: '0.1.1' }, '0.2.0')).toEqual({ failed: null });
  });

  test('running the version that scheduled it means the plugin rolled it back', () => {
    expect(settlePending({ version: '0.2.0', from: '0.1.1' }, '0.1.1')).toEqual({ failed: '0.2.0' });
  });

  test('running anything else, such as a newly installed APK, clears it without blame', () => {
    expect(settlePending({ version: '0.2.0', from: '0.1.1' }, '0.3.0')).toEqual({ failed: null });
  });
});

describe('parsePending', () => {
  test('reads what was stored and ignores garbage', () => {
    expect(parsePending({ version: '0.2.0', from: '0.1.1' })).toEqual({ version: '0.2.0', from: '0.1.1' });
    expect(parsePending({ version: '0.2.0' })).toBeNull();
    expect(parsePending('x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail** — `cd apps/web && bun test src/lib/app-update.test.ts`.

- [ ] **Step 3: Implement**

```ts
/** What the server publishes at `/mobile/update.json`: the mobile bundle of its own commit. */
export type UpdateManifest = {
  version: string;
  /** Relative to the manifest's URL. */
  url: string;
  /** sha256 of the zip, lowercase hex. */
  checksum: string;
  nativeFingerprint: string;
};

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'download'; manifest: UpdateManifest }
  | { kind: 'needs-native' };

/** An update scheduled with `next()`: `from` is the version that scheduled it. */
export type PendingUpdate = { version: string; from: string };

function isRecordOf<K extends string>(value: unknown, keys: readonly K[]): value is Record<K, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    keys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string')
  );
}

export function parseManifest(value: unknown): UpdateManifest | null {
  if (!isRecordOf(value, ['version', 'url', 'checksum', 'nativeFingerprint'] as const)) return null;
  const { version, url, checksum, nativeFingerprint } = value;
  return { version, url, checksum, nativeFingerprint };
}

export function parsePending(value: unknown): PendingUpdate | null {
  if (!isRecordOf(value, ['version', 'from'] as const)) return null;
  return { version: value.version, from: value.from };
}

/**
 * Any other version is taken, not only a newer one, so the app runs what the server runs, rollbacks
 * included. A bundle built against another native layer is never applied.
 */
export function decideUpdate({
  manifest,
  version,
  fingerprint,
  failed,
}: {
  manifest: UpdateManifest | null;
  version: string;
  fingerprint: string;
  failed: readonly string[];
}): UpdateDecision {
  if (!manifest || manifest.version === version || failed.includes(manifest.version)) {
    return { kind: 'none' };
  }
  if (manifest.nativeFingerprint !== fingerprint) return { kind: 'needs-native' };
  return { kind: 'download', manifest };
}

/**
 * Called by a bundle once it is known to work. Starting as the version that scheduled the update
 * means the plugin rolled the update back; any other version (a new APK) says nothing about it.
 */
export function settlePending(pending: PendingUpdate | null, version: string): { failed: string | null } {
  return { failed: pending && pending.from === version && pending.version !== version ? pending.version : null };
}
```

- [ ] **Step 4: Run to see it pass**; mutation check: drop `failed.includes(...)`, the failed-version test fails; restore.
- [ ] **Step 5: Commit** `Decide when the mobile app takes a live update`.

---

### Task 3: Mobile bundle script

**Files:**
- Create: `scripts/mobile-bundle.ts`
- Test: `scripts/mobile-bundle.test.ts`
- Modify: root `package.json` (devDependency `fflate`)

**Interfaces:**
- Consumes: `nativeFingerprint(webDir)` (Task 1), `type UpdateManifest` (Task 2).
- Produces: `writeMobileBundle({ exportDir, publicDir, version, nativeFingerprint }): UpdateManifest`; CLI `bun scripts/mobile-bundle.ts <publicDir>` (export from `apps/web/out`, version from root `package.json`).

- [ ] **Step 1:** `bun add -d fflate` at the root.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';

import { writeMobileBundle } from './mobile-bundle';

describe('writeMobileBundle', () => {
  test('zips the export with index.html at the root and describes it in update.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'mobile-bundle-'));
    const exportDir = join(root, 'out');
    mkdirSync(join(exportDir, 'ru'), { recursive: true });
    writeFileSync(join(exportDir, 'index.html'), '<html>root</html>');
    writeFileSync(join(exportDir, 'ru/index.html'), '<html>ru</html>');
    const publicDir = join(root, 'public');

    const manifest = writeMobileBundle({ exportDir, publicDir, version: '0.2.0', nativeFingerprint: 'f1' });

    const zip = readFileSync(join(publicDir, 'mobile/0.2.0.zip'));
    const files = unzipSync(new Uint8Array(zip));
    expect(Object.keys(files).sort()).toEqual(['index.html', 'ru/index.html']);
    expect(strFromU8(files['ru/index.html'])).toBe('<html>ru</html>');
    expect(manifest).toEqual({
      version: '0.2.0',
      url: '/mobile/0.2.0.zip',
      checksum: createHash('sha256').update(zip).digest('hex'),
      nativeFingerprint: 'f1',
    });
    expect(JSON.parse(readFileSync(join(publicDir, 'mobile/update.json'), 'utf8'))).toEqual(manifest);
  });

  test('refuses an export without index.html, which the plugin could not start', () => {
    const root = mkdtempSync(join(tmpdir(), 'mobile-bundle-'));
    mkdirSync(join(root, 'out'));
    expect(() =>
      writeMobileBundle({ exportDir: join(root, 'out'), publicDir: join(root, 'public'), version: '0.2.0', nativeFingerprint: 'f1' }),
    ).toThrow('index.html');
  });
});
```

- [ ] **Step 3: Run to see it fail.**

- [ ] **Step 4: Implement**

```ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

import type { UpdateManifest } from '../apps/web/src/lib/app-update';
import { nativeFingerprint } from './native-fingerprint';

/**
 * Packs the Capacitor export into `<publicDir>/mobile/<version>.zip` and writes the manifest the
 * installed apps poll. The server serves both as static files.
 */
export function writeMobileBundle({
  exportDir,
  publicDir,
  version,
  nativeFingerprint,
}: {
  exportDir: string;
  publicDir: string;
  version: string;
  nativeFingerprint: string;
}): UpdateManifest {
  if (!existsSync(join(exportDir, 'index.html'))) {
    throw new Error(`${exportDir} has no index.html; build the Capacitor export first`);
  }
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(exportDir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[relative(exportDir, path).split('\\').join('/')] = readFileSync(path);
    }
  }
  const zip = zipSync(files);
  const dir = join(publicDir, 'mobile');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${version}.zip`), zip);
  const manifest: UpdateManifest = {
    version,
    url: `/mobile/${version}.zip`,
    checksum: createHash('sha256').update(zip).digest('hex'),
    nativeFingerprint,
  };
  writeFileSync(join(dir, 'update.json'), JSON.stringify(manifest));
  return manifest;
}

if (import.meta.main) {
  const publicDir = process.argv[2];
  if (!publicDir) throw new Error('usage: bun scripts/mobile-bundle.ts <publicDir>');
  const root = join(import.meta.dir, '..');
  const webDir = join(root, 'apps/web');
  const manifest = writeMobileBundle({
    exportDir: join(webDir, 'out'),
    publicDir,
    version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    nativeFingerprint: nativeFingerprint(webDir),
  });
  console.log(`Mobile bundle ${manifest.version} → ${publicDir}/mobile`);
}
```

- [ ] **Step 5: Run to see it pass**; commit `Pack the Capacitor export as a live update bundle`.

---

### Task 4: Build wiring (Next constants, Docker, CI)

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `Dockerfile`, `.dockerignore`, `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `nativeFingerprint` (Task 1), CLI from Task 3.
- Produces: `process.env.NEXT_PUBLIC_APP_VERSION`, `process.env.NEXT_PUBLIC_NATIVE_FINGERPRINT` in the Capacitor build.

- [ ] **Step 1: `next.config.ts`** — in the `env` block add, Capacitor build only:

```ts
import { readFileSync } from 'node:fs';
import { nativeFingerprint } from '../../scripts/native-fingerprint';
// …
  env: {
    NEXT_PUBLIC_BUILD_TARGET: buildTarget,
    // What a live update is compared against: the bundle's own version and native layer.
    ...(buildTarget === 'capacitor'
      ? {
          NEXT_PUBLIC_APP_VERSION: JSON.parse(
            readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8'),
          ).version,
          NEXT_PUBLIC_NATIVE_FINGERPRINT: nativeFingerprint(import.meta.dirname),
        }
      : {}),
  },
```

Verify: `cd apps/web && bun run build:cap && grep -rl "$(bun -e "console.log(require('../../scripts/native-fingerprint').nativeFingerprint('.'))")" out/_next | head -1` prints a file.

- [ ] **Step 2: `.dockerignore`** — after `apps/web/android` add `!apps/web/android/app/src/main/AndroidManifest.xml`.

- [ ] **Step 3: `Dockerfile` build stage**

```dockerfile
FROM oven/bun:1.4.2 AS build
# The address installed apps call; without it the image carries no mobile bundle.
ARG PUBLIC_URL
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
RUN cd apps/web && bunx next build \
  && cp -r public .next/standalone/apps/web/ \
  && mkdir -p .next/standalone/apps/web/.next \
  && cp -r .next/static .next/standalone/apps/web/.next/ \
  && mv .next/standalone /standalone
# The Capacitor bundle of this commit, which installed apps take as a live update.
RUN if [ -n "$PUBLIC_URL" ]; then \
    cd apps/web && BUILD_TARGET=capacitor NEXT_PUBLIC_API_URL="$PUBLIC_URL" bunx next build \
    && bun ../../scripts/mobile-bundle.ts /standalone/apps/web/public; \
  fi
```

and in the runtime stage `COPY --from=build /standalone ./web`.

- [ ] **Step 4: workflow** — in the `docker` job's `build-push-action` add

```yaml
          build-args: |
            PUBLIC_URL=${{ vars.PUBLIC_URL }}
```

- [ ] **Step 5: Verify**
  - `docker build -t chordtune:local .` succeeds and `docker run --rm --entrypoint ls chordtune:local web/apps/web/public` has no `mobile`.
  - `docker build --build-arg PUBLIC_URL=http://10.0.2.2:3000 -t chordtune:ota .`; run it against local Postgres/Meili (as in the release pipeline smoke test) on port 3100; `curl :3100/mobile/update.json` returns the manifest with the local fingerprint; `curl -o b.zip :3100/mobile/<v>.zip` and `shasum -a 256 b.zip` equals `checksum`; `unzip -l b.zip | grep ' index.html'`.
  - `actionlint` clean.
- [ ] **Step 6: Commit** `Serve the mobile bundle from the Docker image`.

---

### Task 5: Plugin, update hook and banner

**Files:**
- Modify: `apps/web/package.json` (`@capgo/capacitor-updater`), `apps/web/capacitor.config.ts`, `apps/web/android/**` (regenerated by `cap sync`)
- Create: `apps/web/src/lib/use-app-update.ts`, `apps/web/src/components/app-update-banner.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`, `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: Task 2 functions; `API_URL` from `@/lib/api`.
- Produces: `useAppUpdate(): { state: 'idle' | 'ready' | 'needs-native'; restart(): void; dismiss(): void }`, `<AppUpdateBanner />`.

- [ ] **Step 1:** `cd apps/web && bun add @capgo/capacitor-updater@^8.52.1`.

- [ ] **Step 2: `capacitor.config.ts`**

```ts
  plugins: {
    CapacitorUpdater: {
      // Our code checks /mobile/update.json on the app's own server; Capgo's cloud is not used.
      autoUpdate: 'off',
      // The plugin otherwise reports stats, crashes and JS errors to Capgo.
      statsUrl: '',
      keepUrlPathAfterReload: true,
    },
  },
```

- [ ] **Step 3: `src/lib/use-app-update.ts`**

```ts
'use client';

import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { useCallback, useEffect, useRef, useState } from 'react';

import { API_URL } from '@/lib/api';
import { decideUpdate, parseManifest, parsePending, settlePending } from '@/lib/app-update';

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
const FINGERPRINT = process.env.NEXT_PUBLIC_NATIVE_FINGERPRINT ?? '';
const MANIFEST_URL = `${API_URL}/mobile/update.json`;
const PENDING_KEY = 'chordtune.update.pending';
const FAILED_KEY = 'chordtune.update.failed';

export type AppUpdateState = 'idle' | 'ready' | 'needs-native';

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function failedVersions(): string[] {
  const value = readJson(FAILED_KEY);
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** Settles the update this bundle may have been started for; see `settlePending`. */
function settle() {
  const { failed } = settlePending(parsePending(readJson(PENDING_KEY)), VERSION);
  if (failed) localStorage.setItem(FAILED_KEY, JSON.stringify([...failedVersions(), failed]));
  localStorage.removeItem(PENDING_KEY);
}

/**
 * Live updates in the native app: the server's mobile bundle is downloaded in the background and
 * applied on `restart()` or, failing that, by the plugin when the app goes to the background.
 */
export function useAppUpdate() {
  const [state, setState] = useState<AppUpdateState>('idle');
  const dismissed = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let busy = false;
    const downloaded = new Set<string>();

    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
        const manifest = response.ok ? parseManifest(await response.json().catch(() => null)) : null;
        const decision = decideUpdate({ manifest, version: VERSION, fingerprint: FINGERPRINT, failed: failedVersions() });
        if (decision.kind === 'needs-native' && !dismissed.current) setState('needs-native');
        if (decision.kind !== 'download' || downloaded.has(decision.manifest.version)) return;
        const { version, url, checksum } = decision.manifest;
        const bundle = await CapacitorUpdater.download({ version, checksum, url: new URL(url, MANIFEST_URL).href });
        localStorage.setItem(PENDING_KEY, JSON.stringify({ version, from: VERSION }));
        await CapacitorUpdater.next({ id: bundle.id });
        downloaded.add(version);
        if (!dismissed.current) setState('ready');
      } catch {
        // Offline, server down or a failed download: try again on the next check.
      } finally {
        busy = false;
      }
    };

    // Before any request, so a bundle that starts at all is not rolled back.
    void CapacitorUpdater.notifyAppReady().then(() => {
      settle();
      void check();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const restart = useCallback(() => {
    void CapacitorUpdater.reload();
  }, []);
  const dismiss = useCallback(() => {
    dismissed.current = true;
    setState('idle');
  }, []);

  return { state, restart, dismiss };
}
```

- [ ] **Step 4: messages** — add a top-level `update` namespace.
  - ru: `{ "ready": "Обновление готово", "restart": "Перезапустить", "nativeTitle": "Вышла новая версия приложения", "download": "Скачать", "later": "Позже" }`
  - en: `{ "ready": "Update ready", "restart": "Restart", "nativeTitle": "A new version of the app is out", "download": "Download", "later": "Later" }`

- [ ] **Step 5: `src/components/app-update-banner.tsx`** — fixed above the mobile tab bar, `motion` enter/exit like the toast, two actions:

```tsx
'use client';

import { RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';
import { useAppUpdate } from '@/lib/use-app-update';

const RELEASES_URL = 'https://github.com/brofrong/chordtune/releases/latest';

/** Offers a downloaded live update, or a new APK when the native shell is too old for the server. */
export function AppUpdateBanner() {
  const t = useTranslations('update');
  const { state, restart, dismiss } = useAppUpdate();

  return (
    <AnimatePresence>
      {state !== 'idle' && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={spring.pop}
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-xl md:bottom-6"
        >
          <RefreshCw className="size-4 shrink-0 text-primary" />
          <span className="flex-1 font-medium text-sm">
            {state === 'ready' ? t('ready') : t('nativeTitle')}
          </span>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            {t('later')}
          </Button>
          {state === 'ready' ? (
            <Button size="sm" onClick={restart}>
              {t('restart')}
            </Button>
          ) : (
            <Button size="sm" render={<a href={RELEASES_URL} />} onClick={dismiss}>
              {t('download')}
            </Button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

(Check `components/ui/button.tsx` for how it renders as a link — Base UI uses `render`; follow whatever the file supports, e.g. `buttonVariants` on a plain `<a>`.)

- [ ] **Step 6:** render `<AppUpdateBanner />` at the end of `AppShell`'s root `div`.

- [ ] **Step 7:** `bun run cap:sync` (adds the plugin to `android/`), then `bun run check-types`, `bun run lint`, `bun run test` at the root.

- [ ] **Step 8: Commit** `Take live updates in the mobile app`.

---

### Task 6: Docs and end-to-end check

**Files:**
- Modify: `README.md` (Release and Docker sections)

- [ ] **Step 1: README** — Docker: `--build-arg PUBLIC_URL=…` adds the mobile bundle. Release: after the server is updated, installed apps take the new web code on their next start or return; native changes need the APK, which the app offers.

- [ ] **Step 2: Emulator end to end** (local server from Task 4 image `chordtune:ota` on host port 3000-equivalent reachable from the emulator as `http://10.0.2.2:<port>`; `WEB_ORIGINS` includes `https://localhost`):
  1. Build an APK of version A (`appVersionName`) with `NEXT_PUBLIC_API_URL=http://10.0.2.2:<port>`, root version temporarily A; install; server image built with version B. Expect the "Update ready" banner; "Restart" opens the same page on B (check `NEXT_PUBLIC_APP_VERSION` via `preview_evaluate`-free means: e.g. visible change or `chrome://inspect`).
  2. Reinstall A; banner appears; "Later"; background and return; the app runs B.
  3. Image with a bundle whose JS never calls `notifyAppReady` (temporarily stub `useAppUpdate` in a throwaway build): after ~10 s the plugin restores A; the next start does not download it again.
  4. Image whose fingerprint differs (temporary change to `capacitor.config.ts` in the image build only): the "new version" banner shows; "Download" opens the browser.
  5. Cleartext HTTP to `10.0.2.2` may need `android:usesCleartextTraffic` for the debug check only; never commit it.
- [ ] **Step 3:** full root `lint`, `check-types`, `test`; commit `Document live updates`.
