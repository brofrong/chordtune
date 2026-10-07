'use client';

import type { ProviderId } from '@chordtune/api';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { DEEP_LINK_PREFIX } from './mobile-link';

function back(params: Record<string, string>) {
  window.location.replace(`${DEEP_LINK_PREFIX}?${new URLSearchParams(params)}`);
}

/** Decodes Telegram's `tgAuthResult` fragment: base64url, possibly missing its `=` padding. */
function decodeTgAuthResult(encoded: string): Record<string, unknown> | null {
  try {
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Step one in the system browser: start OAuth (after taking over the app's session to link). */
export function MobileAuthStart({
  provider,
  state,
  mode,
  ott,
  telegramBot,
}: {
  provider: ProviderId;
  state: string;
  mode: 'sign-in' | 'link';
  ott: string | null;
  telegramBot: string | null;
}) {
  const t = useTranslations('auth');
  const started = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    (async () => {
      if (mode === 'link' && ott) {
        const { error } = await authClient.oneTimeToken.verify({ token: ott });
        if (error) {
          back({ state, error: error.code ?? 'failed' });
          return;
        }
      }
      const done = `${window.location.origin}${window.location.pathname}/done?${new URLSearchParams({ state, mode, provider })}`;
      if (provider === 'telegram') {
        // Redirect mode: popups are unreliable inside Custom Tabs and Safari View Controller.
        if (!telegramBot) {
          back({ state, error: 'failed' });
          return;
        }
        const origin = window.location.origin;
        window.location.replace(
          `https://oauth.telegram.org/auth?${new URLSearchParams({ bot_id: telegramBot, origin, return_to: done })}`,
        );
        return;
      }
      const options = { callbackURL: done, errorCallbackURL: done };
      const result =
        mode === 'link'
          ? await authClient.linkSocial({ provider, ...options })
          : await authClient.signIn.social({ provider, ...options });
      if (result?.error) {
        setMessage(t('errors.failed'));
        back({ state, error: result.error.code ?? 'failed' });
      }
    })();
  }, [mode, ott, provider, state, telegramBot, t]);

  return <p className="p-8 text-center text-muted-foreground">{message ?? t('redirecting')}</p>;
}

/** Step two: the provider is done; hand the app a one-time token or say the link worked. */
export function MobileAuthDone({
  state,
  mode,
  provider,
}: {
  state: string;
  mode: 'sign-in' | 'link';
  provider: ProviderId;
}) {
  const t = useTranslations('auth');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get('error');
      if (oauthError) {
        back({ state, error: oauthError });
        return;
      }
      if (provider === 'telegram' && window.location.hash.includes('tgAuthResult=')) {
        const encoded = window.location.hash.split('tgAuthResult=')[1] ?? '';
        const data = decodeTgAuthResult(encoded);
        if (!data) {
          back({ state, error: 'failed' });
          return;
        }
        const path = mode === 'link' ? '/telegram/link' : '/telegram/sign-in';
        const { error } = await authClient.$fetch(path, { method: 'POST', body: data });
        if (error) {
          back({ state, error: (error as { code?: string }).code ?? 'failed' });
          return;
        }
      }
      if (mode === 'link') {
        back({ state, linked: provider });
        return;
      }
      const { data, error } = await authClient.oneTimeToken.generate();
      back(error || !data ? { state, error: 'failed' } : { state, token: data.token });
    })();
  }, [mode, provider, state]);

  return <p className="p-8 text-center text-muted-foreground">{t('returning')}</p>;
}
