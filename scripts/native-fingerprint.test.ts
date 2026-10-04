import { describe, expect, test } from 'bun:test';
import { join, relative } from 'node:path';

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

  test('accepts a path relative to the working directory', () => {
    const absolute = nativeFingerprint(join(import.meta.dir, '../apps/web'));
    expect(nativeFingerprint(relative(process.cwd(), join(import.meta.dir, '../apps/web')))).toBe(
      absolute,
    );
  });
});
