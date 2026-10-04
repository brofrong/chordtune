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

    const manifest = writeMobileBundle({
      exportDir,
      publicDir,
      version: '0.2.0',
      nativeFingerprint: 'f1',
    });

    const zip = readFileSync(join(publicDir, 'mobile/0.2.0.zip'));
    const files = unzipSync(new Uint8Array(zip));
    expect(Object.keys(files).sort()).toEqual(['index.html', 'ru/index.html']);
    expect(strFromU8(files['ru/index.html'] ?? new Uint8Array())).toBe('<html>ru</html>');
    expect(manifest).toEqual({
      version: '0.2.0',
      url: '/mobile/0.2.0.zip',
      checksum: createHash('sha256').update(zip).digest('hex'),
      nativeFingerprint: 'f1',
    });
    expect(JSON.parse(readFileSync(join(publicDir, 'mobile/update.json'), 'utf8'))).toEqual(
      manifest,
    );
  });

  test('refuses an export without index.html, which the plugin could not start', () => {
    const root = mkdtempSync(join(tmpdir(), 'mobile-bundle-'));
    mkdirSync(join(root, 'out'));
    expect(() =>
      writeMobileBundle({
        exportDir: join(root, 'out'),
        publicDir: join(root, 'public'),
        version: '0.2.0',
        nativeFingerprint: 'f1',
      }),
    ).toThrow('index.html');
  });
});
