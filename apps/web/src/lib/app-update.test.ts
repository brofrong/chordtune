import { describe, expect, test } from 'bun:test';

import { decideUpdate, parseManifest, parsePending, settlePending } from './app-update';

const manifest = {
  version: '0.2.0',
  url: '/mobile/0.2.0.zip',
  checksum: 'a'.repeat(64),
  nativeFingerprint: 'f1',
};
const own = { version: '0.1.1', fingerprint: 'f1', failed: [] as string[] };

describe('parseManifest', () => {
  test('accepts a complete manifest', () => {
    expect(parseManifest(manifest)).toEqual(manifest);
  });

  test('rejects anything else, such as an HTML page or a partial object', () => {
    for (const value of [
      null,
      'html',
      42,
      {},
      { ...manifest, version: 1 },
      { ...manifest, checksum: undefined },
    ]) {
      expect(parseManifest(value)).toBeNull();
    }
  });
});

describe('decideUpdate', () => {
  test('nothing to do without a manifest or for the same version', () => {
    expect(decideUpdate({ ...own, manifest: null })).toEqual({ kind: 'none' });
    expect(decideUpdate({ ...own, manifest: { ...manifest, version: '0.1.1' } })).toEqual({
      kind: 'none',
    });
  });

  test('a newer version with the same native layer downloads', () => {
    expect(decideUpdate({ ...own, manifest })).toEqual({ kind: 'download', manifest });
  });

  test('an older version downloads too, so the app follows a server rollback', () => {
    const older = { ...manifest, version: '0.1.0' };
    expect(decideUpdate({ ...own, manifest: older })).toEqual({
      kind: 'download',
      manifest: older,
    });
  });

  test('another native layer needs a new APK', () => {
    expect(decideUpdate({ ...own, manifest: { ...manifest, nativeFingerprint: 'f2' } })).toEqual({
      kind: 'needs-native',
    });
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
    expect(settlePending({ version: '0.2.0', from: '0.1.1' }, '0.1.1')).toEqual({
      failed: '0.2.0',
    });
  });

  test('running anything else, such as a newly installed APK, clears it without blame', () => {
    expect(settlePending({ version: '0.2.0', from: '0.1.1' }, '0.3.0')).toEqual({ failed: null });
  });
});

describe('parsePending', () => {
  test('reads what was stored and ignores garbage', () => {
    expect(parsePending({ version: '0.2.0', from: '0.1.1' })).toEqual({
      version: '0.2.0',
      from: '0.1.1',
    });
    expect(parsePending({ version: '0.2.0' })).toBeNull();
    expect(parsePending('x')).toBeNull();
  });
});
