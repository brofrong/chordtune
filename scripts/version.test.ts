import { describe, expect, test } from 'bun:test';

import { bumpVersion, parseVersion, versionCode, withVersion } from './version';

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

describe('withVersion', () => {
  test('replaces the version and keeps the field where it was', () => {
    const updated = withVersion({ name: 'a', version: '0.0.0', type: 'module' }, '0.1.0');
    expect(updated.version).toBe('0.1.0');
    expect(Object.keys(updated)).toEqual(['name', 'version', 'type']);
  });

  test('adds a missing version', () => {
    expect(withVersion({ name: 'a' }, '0.1.0').version).toBe('0.1.0');
  });
});
