import { passkeyClient } from '@better-auth/passkey/client';
import { emailOTPClient, oneTimeTokenClient, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { API_URL, authToken } from './api';

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
      }
    },
  },
});
