import { decideUpdate, parseManifest, parsePending, settlePending } from '@/lib/app-update';

const PENDING_KEY = 'chordtune.update.pending';
const FAILED_KEY = 'chordtune.update.failed';

export type AppUpdateState = 'idle' | 'ready' | 'needs-native';

type Plugin = {
  notifyAppReady(): Promise<unknown>;
  download(options: { url: string; version: string; checksum: string }): Promise<{ id: string }>;
  next(options: { id: string }): Promise<unknown>;
};
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The live update flow, kept apart from React and Capacitor so it can be tested: settles the
 * update the app may have started for, then checks the server's manifest and schedules its bundle.
 */
export function createAppUpdater({
  plugin,
  storage,
  fetchJson,
  manifestUrl,
  version,
  fingerprint,
}: {
  plugin: Plugin;
  storage: KeyValueStorage;
  fetchJson: (url: string) => Promise<unknown>;
  manifestUrl: string;
  version: string;
  fingerprint: string;
}) {
  let state: AppUpdateState = 'idle';
  let dismissed = false;
  let busy = false;
  const downloaded = new Set<string>();
  const listeners = new Set<() => void>();

  const setState = (next: AppUpdateState) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  const readJson = (key: string): unknown => {
    try {
      return JSON.parse(storage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };

  const failedVersions = (): string[] => {
    const value = readJson(FAILED_KEY);
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  };

  const settle = () => {
    const { failed } = settlePending(parsePending(readJson(PENDING_KEY)), version);
    if (failed) storage.setItem(FAILED_KEY, JSON.stringify([...failedVersions(), failed]));
    storage.removeItem(PENDING_KEY);
  };

  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const manifest = parseManifest(await fetchJson(manifestUrl));
      const decision = decideUpdate({ manifest, version, fingerprint, failed: failedVersions() });
      if (decision.kind === 'needs-native' && !dismissed) setState('needs-native');
      if (decision.kind !== 'download' || downloaded.has(decision.manifest.version)) return;
      const { url, checksum } = decision.manifest;
      const target = decision.manifest.version;
      const bundle = await plugin.download({
        version: target,
        checksum,
        url: new URL(url, manifestUrl).href,
      });
      await plugin.next({ id: bundle.id });
      // Recorded only once scheduled, so a failed `next()` is not later taken for a rollback.
      storage.setItem(PENDING_KEY, JSON.stringify({ version: target, from: version }));
      downloaded.add(target);
      if (!dismissed) setState('ready');
    } catch {
      // Offline, server down or a failed download: try again on the next check.
    } finally {
      busy = false;
    }
  };

  let started: Promise<void> | null = null;

  return {
    /**
     * Once per JavaScript context, which is once per app start or bundle switch: a remount of the
     * component calling it must not settle the update this session itself scheduled.
     */
    start() {
      started ??= (async () => {
        // Before any request, so a bundle that starts at all is not rolled back.
        await plugin.notifyAppReady();
        settle();
        await check();
      })();
      return started;
    },

    check,
    dismiss() {
      dismissed = true;
      setState('idle');
    },
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
