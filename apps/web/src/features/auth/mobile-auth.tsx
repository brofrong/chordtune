'use client';

import type { ProviderId } from '@chordtune/api';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import {
  browserFlowStore,
  DEEP_LINK_PREFIX,
  decodeTgAuthResult,
  matchBrowserFlow,
} from './mobile-link';

function back(params: Record<string, string>) {
  window.location.replace(`${DEEP_LINK_PREFIX}?${new URLSearchParams(params)}`);
}

/** The ott travels in the fragment (never sent to a server); read it once, then drop it from the URL. */
function takeOttFromHash(): string | null {
  const ott = new URLSearchParams(window.location.hash.slice(1)).get('ott');
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return ott;
}

/** Step one in the system browser: start OAuth (after taking over the app's session to link). */
export function MobileAuthStart({
  provider,
  state,
  mode,
  telegramBot,
}: {
  provider: ProviderId;
  state: string;
  mode: 'sign-in' | 'link';
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
    const ott = takeOttFromHash();
    // Lets `/auth/mobile/done` confirm this exact tab actually went through this exact flow.
    browserFlowStore.set({ state, mode, provider });
    (async () => {
      if (mode === 'link') {
        if (!ott) {
          back({ state, error: 'failed' });
          return;
        }
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
  }, [mode, provider, state, telegramBot, t]);

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
      // Only a tab that actually ran `/auth/mobile` for this exact flow gets past here — closes
      // the hole where any page could send a signed-in browser straight to this URL and mint a
      // session or a fake `linked` result.
      const saved = browserFlowStore.get();
      if (!matchBrowserFlow(saved, { state, mode, provider })) {
        back({ state, error: 'failed' });
        return;
      }
      browserFlowStore.set(null);
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get('error');
      if (oauthError) {
        back({ state, error: oauthError });
        return;
      }
      if (provider === 'telegram') {
        const result = decodeTgAuthResult(window.location.hash);
        if (result === false) {
          back({ state, error: 'access_denied' });
          return;
        }
        if (!result) {
          back({ state, error: 'failed' });
          return;
        }
        const path = mode === 'link' ? '/telegram/link' : '/telegram/sign-in';
        const { error } = await authClient.$fetch(path, { method: 'POST', body: result });
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
