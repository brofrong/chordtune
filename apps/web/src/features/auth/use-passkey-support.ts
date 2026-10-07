'use client';

import { useQuery } from '@tanstack/react-query';

import { isCapacitor } from '@/features/song/links';
import { nativePasskeysAvailable, passkeySupported } from './passkeys';
import { useAuthMethods } from './use-auth-methods';

/** `passkeySupported`, plus — in the app — whether this device can do passkeys at all. */
export function usePasskeySupport(): boolean {
  const methods = useAuthMethods();
  const configured = passkeySupported(methods.data);
  const device = useQuery({
    queryKey: ['passkeys', 'device'],
    queryFn: nativePasskeysAvailable,
    enabled: configured && isCapacitor,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return configured && (!isCapacitor || device.data === true);
}
