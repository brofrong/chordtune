// Picks the next version, commits it, tags it and pushes; the pushed tag starts the release workflow.
// Usage: bun run release [--dry-run]
import { join } from 'node:path';

import { preflight, publish } from './git';
import { type BumpKind, bumpVersion, versionCode, withVersion } from './version';

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

await Bun.write(packagePath, `${JSON.stringify(withVersion(pkg, next), null, 2)}\n`);
try {
  await publish(root, tag, ['package.json']);
} catch (error) {
  console.error(`Release failed and was rolled back, nothing changed:\n${error}`);
  process.exit(1);
}
console.log(`Pushed ${tag}: https://github.com/brofrong/chordtune/actions`);
