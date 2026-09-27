'use client';

import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { useEffect, useState } from 'react';

/** Whether the device is online: the Capacitor Network plugin in the app, the browser otherwise. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void Network.getStatus().then((status) => setOnline(status.connected));
      const listener = Network.addListener('networkStatusChange', (status) =>
        setOnline(status.connected),
      );
      return () => {
        void listener.then((handle) => handle.remove());
      };
    }
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
