export type BumpKind = 'patch' | 'minor' | 'major';

export function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`"${version}" is not a X.Y.Z version`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function bumpVersion(version: string, kind: BumpKind): string {
  const [major, minor, patch] = parseVersion(version);
  if (kind === 'major') {
    return `${major + 1}.0.0`;
  }
  if (kind === 'minor') {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Android's integer version: two decimal digits each for minor and patch, so every release gets a
 * larger code than the one before it.
 */
export function versionCode(version: string): number {
  const [major, minor, patch] = parseVersion(version);
  if (minor >= 100 || patch >= 100) {
    throw new Error(`${version}: minor and patch must stay below 100 for the Android versionCode`);
  }
  return major * 10000 + minor * 100 + patch;
}

/** A package.json object with its version replaced in place, so the file's field order holds. */
export function withVersion<T extends Record<string, unknown>>(
  pkg: T,
  version: string,
): T & { version: string } {
  return { ...pkg, version };
}
