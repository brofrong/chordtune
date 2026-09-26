import { createAuthClient } from 'better-auth/react';

import { API_URL, authToken } from './api';

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    auth: {
      type: 'Bearer',
      token: () => authToken.get() ?? '',
    },
    onSuccess: (context) => {
      const token = context.response.headers.get('set-auth-token');
      if (token) {
        authToken.set(token);
      }
    },
  },
});
