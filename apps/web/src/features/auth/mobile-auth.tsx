'use client';

import type { ProviderId } from '@chordtune/api';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { authToken } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import {
  appLink,
  browserFlowStore,
  decodeTgAuthResult,
  matchBrowserFlow,
  pickDisplayName,
} from './mobile-link';

/**
 * Sends the browser back to the app. Browsers may refuse to open an app without a user gesture,
 * so the same link also stays on the page as a button.
 */
function useBackToApp() {
  const [href, setHref] = useState<string | null>(null);
  const back = useCallback((params: Record<string, string>) => {
    const link = appLink(params);
    setHref(link);
    window.location.replace(link);
  }, []);
  return [href, back] as const;
}

function BackToApp({ href, message }: { href: string; message: string }) {
  const t = useTranslations('auth');
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <p className="text-muted-foreground">{message}</p>
      <a href={href} className={buttonVariants()}>
        {t('openApp')}
      </a>
    </div>
  );
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
  const [backHref, back] = useBackToApp();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmUsername, setConfirmUsername] = useState<string | null>(null);

  // Lets `/auth/mobile/done` confirm this exact tab actually went through this exact flow. Written
  // only right before the provider redirect, so an early-error exit never leaves a stale entry.
  const proceed = useCallback(async () => {
    browserFlowStore.set({ state, mode, provider });
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
    if (mode === 'sign-in') {
      // The redirect back sets a fresh session cookie but no new token; a token this browser
      // kept from an earlier visit would win over that cookie on `/done`.
      authToken.set(null);
    }
    const result =
      mode === 'link'
        ? await authClient.linkSocial({ provider, ...options })
        : await authClient.signIn.social({ provider, ...options });
    if (result?.error) {
      setMessage(t('errors.failed'));
      back({ state, error: result.error.code ?? 'failed' });
    }
  }, [back, mode, provider, state, telegramBot, t]);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const ott = takeOttFromHash();
    (async () => {
      if (mode === 'link') {
        if (!ott) {
          back({ state, error: 'failed' });
          return;
        }
        const { data, error } = await authClient.oneTimeToken.verify({ token: ott });
        if (error || !data) {
          back({ state, error: error?.code ?? 'failed' });
          return;
        }
        // Linking signs the browser into the ott's account first: an attacker could mint their own
        // ott and send the victim here to link the victim's provider to the attacker's account.
        // Confirm the account before doing anything irreversible.
        setConfirmUsername(pickDisplayName(data.user));
        return;
      }
      await proceed();
    })();
  }, [back, mode, state, proceed]);

  function cancel() {
    browserFlowStore.set(null);
    setConfirmUsername(null);
    back({ state, error: 'access_denied' });
  }

  if (confirmUsername) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <p>
          {t('linkConfirm', { provider: t(`providers.${provider}`), username: confirmUsername })}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setConfirmUsername(null);
              proceed();
            }}
          >
            {t('link')}
          </Button>
          <Button variant="outline" onClick={cancel}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    );
  }

  if (backHref) {
    return <BackToApp href={backHref} message={message ?? t('returning')} />;
  }
  return <p className="p-8 text-center text-muted-foreground">{t('redirecting')}</p>;
}

/**
 * Step two: the provider is done; say the link worked, or — after the user confirms the account —
 * hand the app a one-time token. The token is only minted on that tap: anything that could catch
 * the deep link on its way to the app gets nothing from a page merely being opened.
 */
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
  const [backHref, back] = useBackToApp();
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

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
      const { data } = await authClient.getSession();
      if (!data?.user) {
        back({ state, error: 'failed' });
        return;
      }
      setSignedInAs(pickDisplayName(data.user));
    })();
  }, [back, mode, provider, state]);

  async function continueInApp() {
    setSignedInAs(null);
    const { data, error } = await authClient.oneTimeToken.generate();
    back(error || !data ? { state, error: 'failed' } : { state, token: data.token });
  }

  if (backHref) {
    return <BackToApp href={backHref} message={t('returning')} />;
  }
  if (signedInAs) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-muted-foreground">{t('continueInAppHint')}</p>
        <Button size="lg" onClick={continueInApp}>
          {t('continueInApp', { username: signedInAs })}
        </Button>
      </div>
    );
  }
  return <p className="p-8 text-center text-muted-foreground">{t('returning')}</p>;
}
