'use client';

import type { ProviderId } from '@chordtune/api';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { isCapacitor } from '@/features/song/links';
import { authToken } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { startNativeSignIn } from './native-sign-in';
import { useAuthMethods } from './use-auth-methods';

/** Full-page redirect on the web; the system browser in the app (Task 12). */
export async function signInWithProvider(provider: ProviderId, callbackURL: string) {
  if (isCapacitor) {
    await startNativeSignIn({ provider });
    return;
  }
  if (provider !== 'telegram') {
    // The redirect back sets a fresh session cookie but no new token, and a stored token —
    // a dead one, or the old session being re-confirmed — would win over that cookie.
    authToken.set(null);
    // Yandex is a genericOAuth provider, which Better Auth 1.7 serves through `signIn.social` too.
    await authClient.signIn.social({ provider, callbackURL, errorCallbackURL: callbackURL });
  }
}

export function ProviderButtons({ onTelegram }: { onTelegram: () => void }) {
  const t = useTranslations('auth');
  const methods = useAuthMethods();
  const providers = methods.data?.providers ?? [];
  if (providers.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          variant="outline"
          size="lg"
          onClick={() =>
            provider === 'telegram' && !isCapacitor
              ? onTelegram()
              : signInWithProvider(provider, window.location.href)
          }
        >
          {t(`providers.${provider}`)}
        </Button>
      ))}
    </div>
  );
}
