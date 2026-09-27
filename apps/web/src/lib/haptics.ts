import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** A light tap on phones; nothing in the browser. */
export function tapHaptic() {
  if (Capacitor.isNativePlatform()) {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }
}
