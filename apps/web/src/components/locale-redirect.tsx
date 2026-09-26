'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { preferredLocale } from '@/lib/locale-preference';

/** Picks the locale on the client: the static Capacitor build has no server to negotiate it. */
export function LocaleRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${preferredLocale()}`);
  }, [router]);

  return null;
}
