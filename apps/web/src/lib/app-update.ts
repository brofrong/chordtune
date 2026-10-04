/** What the server publishes at `/mobile/update.json`: the mobile bundle of its own commit. */
export type UpdateManifest = {
  version: string;
  /** Relative to the manifest's URL. */
  url: string;
  /** sha256 of the zip, lowercase hex. */
  checksum: string;
  nativeFingerprint: string;
};

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'download'; manifest: UpdateManifest }
  | { kind: 'needs-native' };

/** An update scheduled with `next()`: `from` is the version that scheduled it. */
export type PendingUpdate = { version: string; from: string };

function isRecordOf<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    keys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string')
  );
}

export function parseManifest(value: unknown): UpdateManifest | null {
  if (!isRecordOf(value, ['version', 'url', 'checksum', 'nativeFingerprint'] as const)) {
    return null;
  }
  const { version, url, checksum, nativeFingerprint } = value;
  return { version, url, checksum, nativeFingerprint };
}

export function parsePending(value: unknown): PendingUpdate | null {
  if (!isRecordOf(value, ['version', 'from'] as const)) return null;
  return { version: value.version, from: value.from };
}

/**
 * Any other version is taken, not only a newer one, so the app runs what the server runs,
 * rollbacks included. A bundle built against another native layer is never applied.
 */
export function decideUpdate({
  manifest,
  version,
  fingerprint,
  failed,
}: {
  manifest: UpdateManifest | null;
  version: string;
  fingerprint: string;
  failed: readonly string[];
}): UpdateDecision {
  if (!manifest || manifest.version === version || failed.includes(manifest.version)) {
    return { kind: 'none' };
  }
  if (manifest.nativeFingerprint !== fingerprint) return { kind: 'needs-native' };
  return { kind: 'download', manifest };
}

/**
 * Called by a bundle once it is known to work. Starting as the version that scheduled the update
 * means the plugin rolled the update back; any other version (a new APK) says nothing about it.
 */
export function settlePending(
  pending: PendingUpdate | null,
  version: string,
): { failed: string | null } {
  return {
    failed:
      pending && pending.from === version && pending.version !== version ? pending.version : null,
  };
}
