'use client';

import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { useCallback, useEffect, useRef, useState } from 'react';

import { API_URL } from '@/lib/api';
import { decideUpdate, parseManifest, parsePending, settlePending } from '@/lib/app-update';

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
const FINGERPRINT = process.env.NEXT_PUBLIC_NATIVE_FINGERPRINT ?? '';
const MANIFEST_URL = `${API_URL}/mobile/update.json`;
const PENDING_KEY = 'chordtune.update.pending';
const FAILED_KEY = 'chordtune.update.failed';

export type AppUpdateState = 'idle' | 'ready' | 'needs-native';

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function failedVersions(): string[] {
  const value = readJson(FAILED_KEY);
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** Settles the update this bundle may have been started for; see `settlePending`. */
function settle() {
  const { failed } = settlePending(parsePending(readJson(PENDING_KEY)), VERSION);
  if (failed) localStorage.setItem(FAILED_KEY, JSON.stringify([...failedVersions(), failed]));
  localStorage.removeItem(PENDING_KEY);
}

/**
 * Live updates in the native app: the server's mobile bundle is downloaded in the background and
 * applied on `restart()` or, failing that, by the plugin when the app goes to the background.
 */
export function useAppUpdate() {
  const [state, setState] = useState<AppUpdateState>('idle');
  const dismissed = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let busy = false;
    const downloaded = new Set<string>();

    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
        const manifest = response.ok
          ? parseManifest(await response.json().catch(() => null))
          : null;
        const decision = decideUpdate({
          manifest,
          version: VERSION,
          fingerprint: FINGERPRINT,
          failed: failedVersions(),
        });
        if (decision.kind === 'needs-native' && !dismissed.current) setState('needs-native');
        if (decision.kind !== 'download' || downloaded.has(decision.manifest.version)) return;
        const { version, url, checksum } = decision.manifest;
        const bundle = await CapacitorUpdater.download({
          version,
          checksum,
          url: new URL(url, MANIFEST_URL).href,
        });
        localStorage.setItem(PENDING_KEY, JSON.stringify({ version, from: VERSION }));
        await CapacitorUpdater.next({ id: bundle.id });
        downloaded.add(version);
        if (!dismissed.current) setState('ready');
      } catch {
        // Offline, server down or a failed download: try again on the next check.
      } finally {
        busy = false;
      }
    };

    // Before any request, so a bundle that starts at all is not rolled back.
    void CapacitorUpdater.notifyAppReady().then(() => {
      settle();
      void check();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const restart = useCallback(() => {
    void CapacitorUpdater.reload();
  }, []);
  const dismiss = useCallback(() => {
    dismissed.current = true;
    setState('idle');
  }, []);

  return { state, restart, dismiss };
}
