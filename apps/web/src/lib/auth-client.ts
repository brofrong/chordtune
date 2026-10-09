import { passkeyClient } from '@better-auth/passkey/client';
import { emailOTPClient, oneTimeTokenClient, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { API_URL, authToken } from './api';
import { isStaleToken } from './stale-token';

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [emailOTPClient(), usernameClient(), oneTimeTokenClient(), passkeyClient()],
  fetchOptions: {
    auth: {
      type: 'Bearer',
      token: () => authToken.get() ?? '',
    },
    // The code email is written in the interface language, not the browser's.
    onRequest: (context) => {
      if (typeof document !== 'undefined') {
        context.headers.set('x-locale', document.documentElement.lang);
      }
      return context;
    },
    onSuccess: (context) => {
      const token = context.response.headers.get('set-auth-token');
      if (token) {
        authToken.set(token);
        return;
      }
      if (
        isStaleToken({
          url: context.request.url,
          data: context.data,
          sentAuthorization: new Headers(context.request.headers).get('authorization'),
          storedToken: authToken.get(),
        })
      ) {
        // Drop it and ask once more: on the web the cookie may hold a live session (in the app
        // there's no cookie, so this simply ends up signed out). The new fetch supersedes this
        // one, so components never see the empty result in between.
        authToken.set(null);
        refetchSession();
      }
    },
  },
});

function refetchSession(): void {
  authClient.$store.notify('$sessionSignal');
}
