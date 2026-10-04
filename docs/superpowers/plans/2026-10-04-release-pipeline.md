# Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pushed `v*` tag publishes one Docker image (API + web) to GHCR and a signed Android APK to a GitHub Release; `bun run release` bumps the version, commits, tags and pushes.

**Architecture:** The web app reaches the API on its own origin through Next rewrites, so one container exposes only Next on :3000 while Bun serves the API on :4000 inside it. A GitHub Actions workflow runs checks, then a Docker job and an Android job in parallel. Version numbers come from the tag; Gradle receives them as properties and signs with a keystore decoded from secrets.

**Tech Stack:** Bun 1.4.2 workspaces + turbo, Next.js 16.3.6 (standalone output), Hono API, Docker Buildx, GitHub Actions, Capacitor 8 / Gradle, JDK 21.

**Spec:** `docs/superpowers/specs/2026-10-04-release-pipeline-design.md`

## Global Constraints

- Workflow triggers only on `push` of tags matching `v*`; the version is the tag without `v`.
- Image: `ghcr.io/brofrong/chordtune:<version>` and `:latest`, `linux/amd64` only, pushed with `GITHUB_TOKEN`.
- Container exposes only port 3000; the API listens on 4000 inside it.
- Runtime env of the image: `DATABASE_URL`, `BETTER_AUTH_URL`, `WEB_ORIGINS`, `MEILI_URL`, `MEILI_KEY`.
- Rewrites: `/trpc/:path*` and `/api/auth/:path*` → `http://localhost:4000`, web build only.
- API base URL: web browser → same origin; web server → `http://localhost:4000`; Capacitor → `NEXT_PUBLIC_API_URL` (required).
- `versionCode = major * 10000 + minor * 100 + patch`; minor and patch must stay below 100.
- Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; variable `PUBLIC_URL`.
- APK asset name `ChordTune-<version>.apk`; release created with `--generate-notes`.
- Release commit message `Release v<version>`; annotated tag `v<version>`.
- Do not commit or push anything while implementing: the user commits only when they ask. Verification replaces the commit steps.
- Code style: Biome (2 spaces, single quotes, width 100), English comments, matching surrounding comment density.

## Review Focus

1. Capacitor build without `NEXT_PUBLIC_API_URL` — must fail the build loudly rather than ship an APK pointing at `localhost`. Pinned in Task 1 (config guard) and in the `resolveApiUrl` test.
2. Release from a dirty tree, another branch, behind `origin/main`, or with an existing tag — the script must refuse before changing anything. Pinned in Task 3 (`preflight` tests on a temporary git repo).
3. A version whose minor or patch reaches 100 — `versionCode` must throw instead of colliding with another release. Pinned in Task 3 tests.
4. One of the two processes in the container dies — the container must exit, not keep serving a half-working app. Pinned in Task 2 (kill the API inside a running container and check it stops).
5. Local Android builds without signing env — must still build (unsigned/debug as before). Pinned in Task 4 (`assembleDebug` without env).

---

## File Structure

- `apps/web/src/lib/api.ts` — modify: base URL chosen by `resolveApiUrl`.
- `apps/web/src/lib/api.test.ts` — create: tests for `resolveApiUrl`.
- `apps/web/next.config.ts` — modify: standalone output, tracing root, rewrites, Capacitor URL guard.
- `.env.example` — modify: note that `NEXT_PUBLIC_API_URL` only feeds the Capacitor build.
- `Dockerfile`, `.dockerignore`, `docker/start.sh` — create: the combined image.
- `apps/api/Dockerfile` — delete.
- `scripts/version.ts` — create: `parseVersion`, `bumpVersion`, `versionCode`.
- `scripts/version.test.ts` — create.
- `scripts/git.ts` — create: `preflight` checks for the release.
- `scripts/git.test.ts` — create.
- `scripts/release.ts` — create: interactive release command.
- `scripts/version-code.ts` — create: prints the versionCode for CI.
- `scripts/android-keystore.sh` — create: one-time keystore generation.
- `package.json` (root) — modify: `version`, `release` script, root tests in `test`.
- `apps/web/android/app/build.gradle` — modify: version properties and optional signing.
- `.github/workflows/release.yml` — create.
- `README.md` — modify: Docker and Release sections.

---

### Task 1: Same-origin API access in the web build

**Files:**
- Modify: `apps/web/src/lib/api.ts:1`
- Create: `apps/web/src/lib/api.test.ts`
- Modify: `apps/web/next.config.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `resolveApiUrl(input: { target: 'web' | 'capacitor'; browserOrigin: string | null; publicApiUrl: string | undefined }): string` and `INTERNAL_API_URL = 'http://localhost:4000'` exported from `apps/web/src/lib/api.ts`; `API_URL` keeps its name and type (`string`), so `trpc.ts`, `trpc-server.ts`, `auth-client.ts` are unchanged.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/api.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { INTERNAL_API_URL, resolveApiUrl } from './api';

describe('resolveApiUrl', () => {
  test('the web build talks to its own origin in the browser', () => {
    expect(
      resolveApiUrl({ target: 'web', browserOrigin: 'https://chordtune.app', publicApiUrl: 'https://x' }),
    ).toBe('https://chordtune.app');
  });

  test('the web build talks to the API directly on the server', () => {
    expect(resolveApiUrl({ target: 'web', browserOrigin: null, publicApiUrl: undefined })).toBe(
      INTERNAL_API_URL,
    );
  });

  test('the Capacitor build uses the public API URL everywhere', () => {
    for (const browserOrigin of ['capacitor://localhost', null]) {
      expect(
        resolveApiUrl({ target: 'capacitor', browserOrigin, publicApiUrl: 'https://chordtune.app' }),
      ).toBe('https://chordtune.app');
    }
  });

  test('the Capacitor build without a public API URL fails instead of pointing at localhost', () => {
    expect(() =>
      resolveApiUrl({ target: 'capacitor', browserOrigin: null, publicApiUrl: undefined }),
    ).toThrow('NEXT_PUBLIC_API_URL');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/web && bun test src/lib/api.test.ts`
Expected: FAIL — `resolveApiUrl` is not exported.

- [ ] **Step 3: Implement** — replace line 1 of `apps/web/src/lib/api.ts` with:

```ts
/** Where the API listens next to the web server: in the container and in `bun run dev`. */
export const INTERNAL_API_URL = 'http://localhost:4000';

/**
 * The web build reaches the API through its own origin (Next rewrites `/trpc` and `/api/auth`),
 * so the same build works on any domain. The Capacitor build has no server to proxy through and
 * calls the public API directly.
 */
export function resolveApiUrl({
  target,
  browserOrigin,
  publicApiUrl,
}: {
  target: 'web' | 'capacitor';
  browserOrigin: string | null;
  publicApiUrl: string | undefined;
}): string {
  if (target === 'capacitor') {
    if (!publicApiUrl) {
      throw new Error('NEXT_PUBLIC_API_URL must be set for the Capacitor build');
    }
    return publicApiUrl;
  }
  return browserOrigin ?? INTERNAL_API_URL;
}

export const API_URL = resolveApiUrl({
  target: process.env.NEXT_PUBLIC_BUILD_TARGET === 'capacitor' ? 'capacitor' : 'web',
  browserOrigin: typeof window === 'undefined' ? null : window.location.origin,
  publicApiUrl: process.env.NEXT_PUBLIC_API_URL,
});
```

- [ ] **Step 4: Run the test** — `cd apps/web && bun test src/lib/api.test.ts` → 4 pass.

- [ ] **Step 5: Next config** — in `apps/web/next.config.ts`:
  - add `import { join } from 'node:path';` at the top;
  - after `const buildTarget = …` add the guard:

```ts
// The app would otherwise ship pointing at localhost, which no phone can reach.
if (buildTarget === 'capacitor' && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL must be set for the Capacitor build');
}

/** The API next to the web server; mirrors INTERNAL_API_URL in src/lib/api.ts. */
const INTERNAL_API_URL = 'http://localhost:4000';
```

  - replace the `...(buildTarget === 'capacitor' ? {…} : {})` spread with:

```ts
  ...(buildTarget === 'capacitor'
    ? {
        output: 'export',
        // Capacitor serves files as-is, so `/ru/` must resolve to `ru/index.html`.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        // The Docker image runs the standalone server; tracing from the repository root picks up
        // the workspace packages.
        output: 'standalone',
        outputFileTracingRoot: join(import.meta.dirname, '../..'),
        // The browser talks to its own origin and Next forwards API calls to the API next to it.
        rewrites: async () => [
          { source: '/trpc/:path*', destination: `${INTERNAL_API_URL}/trpc/:path*` },
          { source: '/api/auth/:path*', destination: `${INTERNAL_API_URL}/api/auth/:path*` },
        ],
      }),
```

- [ ] **Step 6: `.env.example`** — above `NEXT_PUBLIC_API_URL=…` add `# Capacitor build only; the web build calls the API through its own origin`.

- [ ] **Step 7: Verify**
  - `cd apps/web && bun test src` → all pass.
  - `bun run check-types` (root) → success; `bunx biome check apps/web` → clean.
  - With API (`cd apps/api && bun run dev`) and web (`cd apps/web && bun run dev`) running: `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/auth/get-session` → `200`; `curl -s 'localhost:3000/trpc/songs.list?batch=1&input=%7B%7D' -o /dev/null -w '%{http_code}'` → `200` (any non-404 from tRPC proves the proxy).
  - `cd apps/web && NEXT_PUBLIC_API_URL= BUILD_TARGET=capacitor bunx next build` fails with the guard message (`.env` also defines the variable, so blank it explicitly).

---

### Task 2: Combined Docker image

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker/start.sh`
- Delete: `apps/api/Dockerfile`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 standalone output at `apps/web/.next/standalone/apps/web/server.js`; rewrites to `http://localhost:4000`.
- Produces: root `Dockerfile` used by the workflow's docker job (`context: .`).

- [ ] **Step 1: `.dockerignore`**

```
**/node_modules
**/.next
**/.turbo
**/out
apps/web/android
apps/web/ios
.git
.env
.env.*
.superpowers
docs
```

- [ ] **Step 2: `docker/start.sh`**

```bash
#!/usr/bin/env bash
# Runs the API and the web server side by side. When either exits the other is stopped and the
# container exits, so the orchestrator restarts the whole thing instead of serving half an app.
set -u

(cd /app/apps/api && exec bun src/index.ts) &
api=$!
(cd /app/web && PORT=3000 HOSTNAME=0.0.0.0 exec node apps/web/server.js) &
web=$!

trap 'kill -TERM "$api" "$web" 2>/dev/null' TERM INT

wait -n "$api" "$web"
status=$?
kill -TERM "$api" "$web" 2>/dev/null
wait
exit "$((status == 0 ? 1 : status))"
```

Make it executable: `chmod +x docker/start.sh`.

- [ ] **Step 3: `Dockerfile`**

```dockerfile
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
```

If `bun install --production --filter` cannot resolve `@chordtune/chord-sheet` at runtime (check in Step 5), copy `packages/chord-sheet` before the install in `api-deps` and copy its `node_modules` link too; the requirement is that `bun src/index.ts` in `/app/apps/api` imports the workspace package.

- [ ] **Step 4: Delete `apps/api/Dockerfile`**; in `README.md` change the API bullet to `` `apps/api` — Hono + tRPC + Better Auth + Drizzle ORM 1.0 on Bun `` and add after `## Mobile`:

````markdown
## Docker

One image runs both the API and the web app; only port 3000 is exposed and Next forwards
`/trpc` and `/api/auth` to the API inside the container.

```sh
docker build -t chordtune .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://… -e BETTER_AUTH_URL=https://your.domain \
  -e WEB_ORIGINS=https://your.domain,capacitor://localhost,https://localhost \
  -e MEILI_URL=http://… -e MEILI_KEY=… chordtune
```
````

- [ ] **Step 5: Verify**
  - `docker build -t chordtune:local .` → succeeds.
  - Run against the local compose services:
    `docker run -d --name ct -p 3100:3000 -e DATABASE_URL=postgres://chordtune:chordtune@host.docker.internal:5432/chordtune -e BETTER_AUTH_URL=http://localhost:3100 -e WEB_ORIGINS=http://localhost:3100 -e MEILI_URL=http://host.docker.internal:7700 -e MEILI_KEY=chordtune-dev-master-key chordtune:local`
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3100/ru` → `200`; `localhost:3100/api/auth/get-session` → `200`; `localhost:3100/trpc/songs.list?batch=1&input=%7B%7D` → not `404`.
  - Review Focus 4: `docker exec ct pkill -f 'bun src/index.ts'`, then `docker ps -a --filter name=ct --format '{{.Status}}'` shows `Exited`. `docker rm -f ct` afterwards.
  - `bunx biome check .` → clean.

---

### Task 3: Version helpers and the release command

**Files:**
- Create: `scripts/version.ts`, `scripts/version.test.ts`, `scripts/git.ts`, `scripts/git.test.ts`, `scripts/release.ts`, `scripts/version-code.ts`
- Modify: `package.json` (root)

**Interfaces:**
- Produces:
  - `type BumpKind = 'patch' | 'minor' | 'major'`
  - `parseVersion(version: string): [number, number, number]` — throws on anything but `X.Y.Z`
  - `bumpVersion(version: string, kind: BumpKind): string`
  - `versionCode(version: string): number` — throws when minor or patch ≥ 100
  - `preflight(cwd: string, tag: string): Promise<string[]>` — list of problems, empty when ready
  - CLI `bun scripts/version-code.ts <version>` prints the code (used by Task 5)

- [ ] **Step 1: Failing tests** — `scripts/version.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { bumpVersion, parseVersion, versionCode } from './version';

describe('parseVersion', () => {
  test('reads major, minor and patch', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });

  test('rejects anything but X.Y.Z', () => {
    for (const bad of ['1.2', 'v1.2.3', '1.2.3-beta', '', '01.a.3']) {
      expect(() => parseVersion(bad)).toThrow();
    }
  });
});

describe('bumpVersion', () => {
  test('patch, minor and major reset the parts below them', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  test('the first release starts from 0.0.0', () => {
    expect(bumpVersion('0.0.0', 'minor')).toBe('0.1.0');
  });
});

describe('versionCode', () => {
  test('packs the version so that later versions get larger codes', () => {
    expect(versionCode('1.2.3')).toBe(10203);
    expect(versionCode('0.1.0')).toBe(100);
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.99.99'));
  });

  test('refuses minor or patch numbers that would collide with the next part', () => {
    expect(() => versionCode('1.100.0')).toThrow();
    expect(() => versionCode('1.0.100')).toThrow();
  });
});
```

`scripts/git.test.ts` (temporary repos with a bare `origin`):

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

import { preflight } from './git';

let root: string;
let work: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'release-'));
  work = join(root, 'work');
  await $`git init -q --bare -b main ${join(root, 'origin.git')}`.quiet();
  await $`git clone -q ${join(root, 'origin.git')} ${work}`.quiet();
  await $`git -C ${work} -c user.name=t -c user.email=t@t commit -q --allow-empty -m init`.quiet();
  await $`git -C ${work} push -q origin main`.quiet();
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('preflight', () => {
  test('a clean main in sync with origin is ready', async () => {
    expect(await preflight(work, 'v0.1.0')).toEqual([]);
  });

  test('uncommitted changes block the release', async () => {
    writeFileSync(join(work, 'file.txt'), 'x');
    expect((await preflight(work, 'v0.1.0')).join()).toContain('uncommitted');
  });

  test('another branch blocks the release', async () => {
    await $`git -C ${work} switch -q -c feature`.quiet();
    expect((await preflight(work, 'v0.1.0')).join()).toContain('main');
  });

  test('a local commit not on origin blocks the release', async () => {
    await $`git -C ${work} -c user.name=t -c user.email=t@t commit -q --allow-empty -m local`.quiet();
    expect((await preflight(work, 'v0.1.0')).join()).toContain('origin/main');
  });

  test('an existing tag blocks the release', async () => {
    await $`git -C ${work} tag v0.1.0`.quiet();
    expect((await preflight(work, 'v0.1.0')).join()).toContain('v0.1.0');
  });
});
```

- [ ] **Step 2: Run to see them fail** — `bun test ./scripts` → FAIL, modules missing.

- [ ] **Step 3: `scripts/version.ts`**

```ts
export type BumpKind = 'patch' | 'minor' | 'major';

export function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`"${version}" is not a X.Y.Z version`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function bumpVersion(version: string, kind: BumpKind): string {
  const [major, minor, patch] = parseVersion(version);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Android's integer version: two decimal digits each for minor and patch, so every release gets a
 * larger code than the one before it.
 */
export function versionCode(version: string): number {
  const [major, minor, patch] = parseVersion(version);
  if (minor >= 100 || patch >= 100) {
    throw new Error(`${version}: minor and patch must stay below 100 for the Android versionCode`);
  }
  return major * 10000 + minor * 100 + patch;
}
```

- [ ] **Step 4: `scripts/git.ts`**

```ts
import { $ } from 'bun';

/** Reasons the repository at `cwd` is not ready to release `tag`; empty when it is. */
export async function preflight(cwd: string, tag: string): Promise<string[]> {
  const git = (...args: string[]) => $`git -C ${cwd} ${args}`.quiet().nothrow();
  const problems: string[] = [];

  const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).text().trim();
  if (branch !== 'main') {
    problems.push(`releases are made from main, not ${branch}`);
  }
  if ((await git('status', '--porcelain')).text().trim()) {
    problems.push('there are uncommitted changes');
  }
  await git('fetch', '--quiet', '--tags', 'origin');
  const head = (await git('rev-parse', 'HEAD')).text().trim();
  const remote = (await git('rev-parse', 'origin/main')).text().trim();
  if (head !== remote) {
    problems.push('main differs from origin/main: pull or push first');
  }
  if ((await git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)).exitCode === 0) {
    problems.push(`tag ${tag} already exists`);
  }
  return problems;
}
```

- [ ] **Step 5: Run the tests** — `bun test ./scripts` → all pass.

- [ ] **Step 6: `scripts/release.ts`**

```ts
// Picks the next version, commits it, tags it and pushes; the pushed tag starts the release workflow.
// Usage: bun run release [--dry-run]
import { join } from 'node:path';
import { $ } from 'bun';

import { preflight } from './git';
import { type BumpKind, bumpVersion, versionCode } from './version';

const root = join(import.meta.dir, '..');
const dryRun = process.argv.includes('--dry-run');
const packagePath = join(root, 'package.json');
const pkg = await Bun.file(packagePath).json();
const current: string = pkg.version ?? '0.0.0';

const kinds: BumpKind[] = ['patch', 'minor', 'major'];
console.log(`Current version: ${current}`);
kinds.forEach((kind, i) => {
  console.log(`  ${i + 1}) ${kind.padEnd(5)} → ${bumpVersion(current, kind)}`);
});
const kind = kinds[Number(prompt('Bump to [1-3]:')) - 1];
if (!kind) {
  console.error('Nothing chosen, nothing changed.');
  process.exit(1);
}
const next = bumpVersion(current, kind);
const tag = `v${next}`;
versionCode(next); // fail now rather than in the Android job

const problems = await preflight(root, tag);
if (problems.length > 0) {
  console.error(`Cannot release ${tag}:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
if (prompt(`Release ${tag}? [y/N]`)?.toLowerCase() !== 'y') {
  console.error('Cancelled, nothing changed.');
  process.exit(1);
}

if (dryRun) {
  console.log(`Dry run: would set version ${next}, commit "Release ${tag}", tag ${tag} and push.`);
  process.exit(0);
}

// Keep `version` right after `private` rather than at the end of the file.
const { name, private: isPrivate, ...rest } = pkg;
await Bun.write(
  packagePath,
  `${JSON.stringify({ name, private: isPrivate, version: next, ...rest }, null, 2)}\n`,
);
await $`git -C ${root} commit -q -m ${`Release ${tag}`} -- package.json`;
await $`git -C ${root} tag -a ${tag} -m ${`Release ${tag}`}`;
await $`git -C ${root} push --atomic origin main ${tag}`;
console.log(`Pushed ${tag}: https://github.com/brofrong/chordtune/actions`);
```


- [ ] **Step 7: `scripts/version-code.ts`**

```ts
// Prints the Android versionCode for a version: bun scripts/version-code.ts 1.2.3
import { versionCode } from './version';

const version = process.argv[2];
if (!version) {
  console.error('Usage: bun scripts/version-code.ts <X.Y.Z>');
  process.exit(1);
}
console.log(versionCode(version));
```

- [ ] **Step 8: Root `package.json`** — add `"version": "0.0.0",` after `"private": true,`; in `scripts` set `"test": "turbo run test && bun test ./scripts"` and add `"release": "bun scripts/release.ts"`.

- [ ] **Step 9: Verify**
  - `bun test ./scripts` → all pass; `bun scripts/version-code.ts 1.2.3` → `10203`.
  - `bunx biome check scripts package.json` → clean.
  - `printf '2\ny\n' | bun run release --dry-run` on the current (dirty) tree → lists "uncommitted changes" and exits 1 without touching `package.json` (`git diff --quiet package.json` unchanged apart from Step 8).

---

### Task 4: Android version properties and release signing

**Files:**
- Modify: `apps/web/android/app/build.gradle`
- Create: `scripts/android-keystore.sh`

**Interfaces:**
- Consumes: Gradle properties `-PappVersionName=<X.Y.Z> -PappVersionCode=<int>`; env `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Produces: signed `app/build/outputs/apk/release/app-release.apk` when the env is set.

- [ ] **Step 1: `build.gradle`** — above `android {` add:

```groovy
// CI passes the release key through the environment; without it release builds stay unsigned.
def releaseKeystore = System.getenv('ANDROID_KEYSTORE_PATH')
```

In `defaultConfig` replace `versionCode 1` / `versionName "1.0"` with:

```groovy
        // CI sets both from the git tag; local builds keep the defaults.
        versionCode((project.findProperty('appVersionCode') ?: '1') as int)
        versionName(project.findProperty('appVersionName') ?: '1.0')
```

After `defaultConfig { … }` add:

```groovy
    signingConfigs {
        if (releaseKeystore) {
            release {
                storeFile file(releaseKeystore)
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
    }
```

In `buildTypes { release { … } }` add `if (releaseKeystore) { signingConfig signingConfigs.release }`.

- [ ] **Step 2: `scripts/android-keystore.sh`**

```bash
#!/usr/bin/env bash
# Creates the Android release key once and prints the commands that hand it to GitHub Actions.
# Keep the generated folder safe: without this key installed apps can no longer be updated.
set -euo pipefail

dir="${1:-$HOME/.chordtune-release}"
keystore="$dir/chordtune-release.keystore"
alias=chordtune

if [[ -e "$keystore" ]]; then
  echo "$keystore already exists; refusing to overwrite the release key." >&2
  exit 1
fi
mkdir -p "$dir"
password="$(openssl rand -hex 24)"

keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$keystore" -alias "$alias" \
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=ChordTune" \
  -storepass "$password" -keypass "$password"
printf '%s\n' "$password" > "$dir/password.txt"
chmod 600 "$keystore" "$dir/password.txt"

cat <<EOF

Release key: $keystore (password in $dir/password.txt). Back up this folder.

Hand it to GitHub Actions:
  base64 -i "$keystore" | gh secret set ANDROID_KEYSTORE_BASE64
  gh secret set ANDROID_KEYSTORE_PASSWORD < "$dir/password.txt"
  gh secret set ANDROID_KEY_PASSWORD < "$dir/password.txt"
  gh secret set ANDROID_KEY_ALIAS --body $alias
  gh variable set PUBLIC_URL --body https://your.domain
EOF
```

`chmod +x scripts/android-keystore.sh`.

- [ ] **Step 3: Verify** (JDK 21 from Android Studio: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`)
  - `scripts/android-keystore.sh /tmp/ct-key` creates the files and prints the commands; running it again refuses.
  - `cd apps/web && bun run build:cap && bunx cap sync android`.
  - Review Focus 5: `cd android && ./gradlew assembleDebug` without signing env → succeeds.
  - `ANDROID_KEYSTORE_PATH=/tmp/ct-key/chordtune-release.keystore ANDROID_KEYSTORE_PASSWORD=$(cat /tmp/ct-key/password.txt) ANDROID_KEY_PASSWORD=$(cat /tmp/ct-key/password.txt) ANDROID_KEY_ALIAS=chordtune ./gradlew assembleRelease -PappVersionName=0.1.0 -PappVersionCode=100` → succeeds.
  - `$ANDROID_HOME/build-tools/<latest>/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk` shows `CN=ChordTune`; `aapt2 dump badging` (same folder) shows `versionCode='100' versionName='0.1.0'`.
  - `rm -rf /tmp/ct-key`.

---

### Task 5: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: root `Dockerfile` (Task 2), `bun scripts/version-code.ts` (Task 3), Gradle properties and signing env (Task 4), the Capacitor URL guard (Task 1).

- [ ] **Step 1: `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ['v*']

concurrency:
  group: release-${{ github.ref }}

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run check-types
      - run: bun run test

  docker:
    needs: checks
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v5
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=raw,value=latest
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  android:
    needs: checks
    runs-on: ubuntu-latest
    permissions:
      contents: write
    env:
      VERSION: ${{ github.ref_name }}
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
          cache: gradle
      - run: bun install --frozen-lockfile
      - name: Version
        run: |
          version="${VERSION#v}"
          echo "VERSION=$version" >> "$GITHUB_ENV"
          echo "VERSION_CODE=$(bun scripts/version-code.ts "$version")" >> "$GITHUB_ENV"
      - name: Web build for Capacitor
        working-directory: apps/web
        env:
          NEXT_PUBLIC_API_URL: ${{ vars.PUBLIC_URL }}
        run: bun run build:cap && bunx cap sync android
      - name: Release key
        env:
          KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
        run: |
          echo "$KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/release.keystore"
          echo "ANDROID_KEYSTORE_PATH=$RUNNER_TEMP/release.keystore" >> "$GITHUB_ENV"
      - name: Build APK
        working-directory: apps/web/android
        env:
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: ./gradlew assembleRelease -PappVersionName="$VERSION" -PappVersionCode="$VERSION_CODE"
      - name: GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          cp apps/web/android/app/build/outputs/apk/release/app-release.apk "ChordTune-$VERSION.apk"
          gh release create "$GITHUB_REF_NAME" --generate-notes "ChordTune-$VERSION.apk"
```

The `Version` step overwrites `VERSION` (tag `v1.2.3`) with the bare `1.2.3` for later steps; `GITHUB_REF_NAME` keeps the tag for `gh release create`.

- [ ] **Step 2: README** — add after the Docker section:

````markdown
## Release

```sh
bun run release               # pick patch/minor/major, commit, tag and push
```

A pushed `v*` tag runs `.github/workflows/release.yml`: checks, then the Docker image
`ghcr.io/brofrong/chordtune:<version>` and a signed APK on the GitHub Release. One-time setup:
`scripts/android-keystore.sh` creates the release key and prints the `gh secret set` commands, and
the `PUBLIC_URL` repository variable is the address the Android app talks to.
````

- [ ] **Step 3: Verify**
  - `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color` → no findings.
  - Root `bun run lint`, `bun run check-types`, `bun run test` → all pass (the same commands the `checks` job runs).

---

### Task 6: Whole-change review

- [ ] Run a fresh reviewer over the whole diff against the spec and this plan; fix what it finds and re-run the affected verification.
- [ ] Report to the user: what is ready, what the first real tag still has to prove (GHCR push, `gh release create`, secrets), and the one-time setup steps.
