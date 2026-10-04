import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

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
  // `createRequire` needs an absolute path.
  const packageJson = join(resolve(webDir), 'package.json');
  const pkg = JSON.parse(readFileSync(packageJson, 'utf8'));
  const require = createRequire(packageJson);
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
