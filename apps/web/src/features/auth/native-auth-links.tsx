'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { useToast } from '@/components/toast';
import { authErrorKey } from './auth-errors';
import { listenForAuthLinks } from './native-sign-in';
import { useSession } from './use-session';

/** Finishes sign-in and linking when the system browser comes back by deep link. */
export function NativeAuthLinks() {
  const t = useTranslations('auth');
  const toast = useToast();
  const session = useSession();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      listenForAuthLinks(
        async () => {
          await session.refetch();
          await queryClient.invalidateQueries();
        },
        async () => {
          await queryClient.invalidateQueries();
        },
        (code) => toast(t(`errors.${authErrorKey(code)}`), 'error'),
      ),
    [queryClient, session, t, toast],
  );

  return null;
}
