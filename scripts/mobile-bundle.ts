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
