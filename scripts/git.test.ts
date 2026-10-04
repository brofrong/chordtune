import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

import { preflight, publish } from './git';

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

  test('an unreachable origin blocks the release instead of trusting a stale origin/main', async () => {
    await $`git -C ${work} remote set-url origin ${join(root, 'missing.git')}`.quiet();
    expect((await preflight(work, 'v0.1.0')).join()).toContain('fetch');
  });

  test('an existing tag blocks the release', async () => {
    await $`git -C ${work} tag v0.1.0`.quiet();
    expect((await preflight(work, 'v0.1.0')).join()).toContain('v0.1.0');
  });
});

describe('publish', () => {
  const identity = ['-c', 'user.name=t', '-c', 'user.email=t@t'];
  const original = '{"version":"0.0.0"}\n';

  beforeEach(async () => {
    writeFileSync(join(work, 'package.json'), original);
    await $`git -C ${work} add package.json`.quiet();
    await $`git -C ${work} ${identity} commit -q -m pkg`.quiet();
    await $`git -C ${work} push -q origin main`.quiet();
    writeFileSync(join(work, 'package.json'), '{"version":"0.1.0"}\n');
  });

  test('commits the file, tags it and pushes both', async () => {
    await publish(work, 'v0.1.0', ['package.json'], identity);
    const remote = join(root, 'origin.git');
    expect((await $`git -C ${remote} log -1 --format=%s main`.text()).trim()).toBe(
      'Release v0.1.0',
    );
    expect((await $`git -C ${remote} tag`.text()).trim()).toBe('v0.1.0');
  });

  test('a failed push leaves no release commit, tag or file change behind', async () => {
    const before = (await $`git -C ${work} rev-parse HEAD`.text()).trim();
    await $`git -C ${work} remote set-url origin ${join(root, 'missing.git')}`.quiet();
    await expect(publish(work, 'v0.1.0', ['package.json'], identity)).rejects.toThrow();
    expect((await $`git -C ${work} rev-parse HEAD`.text()).trim()).toBe(before);
    expect((await $`git -C ${work} tag`.text()).trim()).toBe('');
    expect(readFileSync(join(work, 'package.json'), 'utf8')).toBe(original);
  });
});
