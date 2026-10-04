// Prints the Android versionCode for a version: bun scripts/version-code.ts 1.2.3
import { versionCode } from './version';

const version = process.argv[2];
if (!version) {
  console.error('Usage: bun scripts/version-code.ts <X.Y.Z>');
  process.exit(1);
}
console.log(versionCode(version));
