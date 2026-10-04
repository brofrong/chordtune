import { describe, expect, test } from 'bun:test';

import { createAppUpdater } from './app-updater';

const MANIFEST_URL = 'https://chordtune.app/mobile/update.json';
const manifest = {
  version: '0.1.2',
  url: '/mobile/0.1.2.zip',
  checksum: 'a'.repeat(64),
  nativeFingerprint: 'f1',
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function fakePlugin({ nextFails = false } = {}) {
  const calls: string[] = [];
  return {
    calls,
    notifyAppReady: async () => void calls.push('ready'),
    download: async ({ url, version }: { url: string; version: string; checksum: string }) => {
      calls.push(`download ${version} ${url}`);
      return { id: `id-${version}` };
    },
    next: async ({ id }: { id: string }) => {
      if (nextFails) throw new Error('no index.html');
      calls.push(`next ${id}`);
    },
  };
}

function setup({
  version = '0.1.1',
  served = manifest as unknown,
  storage = memoryStorage(),
  plugin = fakePlugin(),
} = {}) {
  const updater = createAppUpdater({
    plugin,
    storage,
    fetchJson: async () => served,
    manifestUrl: MANIFEST_URL,
    version,
    fingerprint: 'f1',
  });
  return { updater, storage, plugin };
}

describe('createAppUpdater', () => {
  test('downloads the server bundle on start and schedules it', async () => {
    const { updater, plugin, storage } = setup();
    await updater.start();
    expect(plugin.calls).toEqual([
      'ready',
      'download 0.1.2 https://chordtune.app/mobile/0.1.2.zip',
      'next id-0.1.2',
    ]);
    expect(updater.getState()).toBe('ready');
    expect(JSON.parse(storage.getItem('chordtune.update.pending') ?? '')).toEqual({
      version: '0.1.2',
      from: '0.1.1',
    });
  });

  test('starting again in the same session, as a remount does, keeps the scheduled update', async () => {
    const { updater, storage } = setup();
    await updater.start();
    await updater.start();
    expect(storage.getItem('chordtune.update.failed')).toBeNull();
    expect(storage.getItem('chordtune.update.pending')).not.toBeNull();
    expect(updater.getState()).toBe('ready');
  });

  test('a later check does not download the same version twice', async () => {
    const { updater, plugin } = setup();
    await updater.start();
    await updater.check();
    expect(plugin.calls.filter((call) => call.startsWith('download'))).toHaveLength(1);
  });

  test('a dismissed banner stays hidden for the rest of the session', async () => {
    const { updater } = setup({ served: { ...manifest, nativeFingerprint: 'f2' } });
    await updater.start();
    expect(updater.getState()).toBe('needs-native');
    updater.dismiss();
    await updater.start();
    await updater.check();
    expect(updater.getState()).toBe('idle');
  });

  test('a rollback seen on the next start marks the version failed and does not retry it', async () => {
    const storage = memoryStorage({
      'chordtune.update.pending': JSON.stringify({ version: '0.1.2', from: '0.1.1' }),
    });
    const { updater, plugin } = setup({ storage });
    await updater.start();
    expect(JSON.parse(storage.getItem('chordtune.update.failed') ?? '')).toEqual(['0.1.2']);
    expect(storage.getItem('chordtune.update.pending')).toBeNull();
    expect(plugin.calls).toEqual(['ready']);
    expect(updater.getState()).toBe('idle');
  });

  test('a schedule that fails leaves nothing pending to be blamed later', async () => {
    const { updater, storage } = setup({ plugin: fakePlugin({ nextFails: true }) });
    await updater.start();
    expect(storage.getItem('chordtune.update.pending')).toBeNull();
    expect(updater.getState()).toBe('idle');
  });

  test('no manifest, such as an HTML page or a failed request, changes nothing', async () => {
    for (const served of [null, '<html>', { version: 1 }]) {
      const { updater, plugin } = setup({ served });
      await updater.start();
      expect(plugin.calls).toEqual(['ready']);
      expect(updater.getState()).toBe('idle');
    }
  });

  test('tells subscribers when the state changes', async () => {
    const { updater } = setup();
    const seen: string[] = [];
    updater.subscribe(() => seen.push(updater.getState()));
    await updater.start();
    expect(seen).toEqual(['ready']);
  });
});
