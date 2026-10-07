import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { ProviderId } from '@chordtune/api';

import { API_URL, authToken } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import {
  createPendingAuth,
  matchPendingAuth,
  mobileStartUrl,
  parseAuthLink,
  pendingAuthStore,
} from './mobile-link';

/**
 * Opens the provider in the system browser via our web page. Linking needs the user's session in
 * that browser, so the app hands it over as a one-time token.
 */
export async function startNativeSignIn({
  provider,
  mode = 'sign-in',
}: {
  provider: ProviderId;
  mode?: 'sign-in' | 'link';
}): Promise<void> {
  const pending = createPendingAuth(mode, provider);
  pendingAuthStore.set(pending);
  let ott: string | undefined;
  if (mode === 'link') {
    const { data } = await authClient.oneTimeToken.generate();
    ott = data?.token;
  }
  await Browser.open({
    url: mobileStartUrl({
      origin: API_URL,
      locale: document.documentElement.lang,
      provider,
      state: pending.state,
      mode,
      ott,
    }),
    presentationStyle: 'popover',
  });
}

export function listenForAuthLinks(
  onSignedIn: () => void,
  onLinked: (provider: string) => void,
  onError: (code: string) => void,
) {
  const handle = App.addListener('appUrlOpen', async ({ url }) => {
    const link = parseAuthLink(url);
    if (!link) {
      return;
    }
    const pending = pendingAuthStore.get();
    if (!matchPendingAuth(pending, link)) {
      return;
    }
    pendingAuthStore.set(null);
    await Browser.close().catch(() => {});
    if (link.error) {
      onError(link.error);
    } else if (link.token) {
      const { data, error } = await authClient.oneTimeToken.verify({ token: link.token });
      if (error || !data) {
        onError(error?.code ?? 'failed');
        return;
      }
      authToken.set(data.session.token);
      onSignedIn();
    } else if (link.linked) {
      onLinked(link.linked);
    }
  });
  return () => {
    handle.then((listener) => listener.remove());
  };
}
