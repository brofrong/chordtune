'use client';

import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { useEffect, useSyncExternalStore } from 'react';

import { API_URL } from '@/lib/api';
import { type AppUpdateState, createAppUpdater } from '@/lib/app-updater';

type AppUpdater = ReturnType<typeof createAppUpdater>;

// One per JavaScript context: the layout that renders the banner remounts on a language switch.
let updater: AppUpdater | null = null;

function getUpdater(): AppUpdater {
  updater ??= createAppUpdater({
    plugin: CapacitorUpdater,
    storage: localStorage,
    fetchJson: async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      return response.ok ? response.json().catch(() => null) : null;
    },
    manifestUrl: `${API_URL}/mobile/update.json`,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
    fingerprint: process.env.NEXT_PUBLIC_NATIVE_FINGERPRINT ?? '',
  });
  return updater;
}

const noop = () => () => {};
const idle = (): AppUpdateState => 'idle';

/**
 * Live updates in the native app: the server's mobile bundle is downloaded in the background and
 * applied on `restart()` or, failing that, by the plugin when the app goes to the background.
 */
export function useAppUpdate() {
  const native = Capacitor.isNativePlatform();
  const state = useSyncExternalStore(
    native ? (listener) => getUpdater().subscribe(listener) : noop,
    native ? () => getUpdater().getState() : idle,
    idle,
  );

  useEffect(() => {
    if (!native) return;
    const current = getUpdater();
    void current.start();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void current.check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [native]);

  return {
    state,
    restart: () => void CapacitorUpdater.reload(),
    dismiss: () => getUpdater().dismiss(),
  };
}
