'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from './auth-errors';
import { normalizeOtp, OTP_LENGTH } from './otp';

const RESEND_SECONDS = 60;

export function EmailCodeForm({ onDone }: { onDone: () => Promise<void> | void }) {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async (to: string) => {
    setPending(true);
    setError(null);
    const result = await authClient.emailOtp.sendVerificationOtp({ email: to, type: 'sign-in' });
    setPending(false);
    if (result.error) {
      setError(t(`errors.${authErrorKey(result.error)}`));
      return;
    }
    setSentTo(to);
    setCode('');
    setWait(RESEND_SECONDS);
  };

  const verify = async (otp: string) => {
    if (!sentTo) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await authClient.signIn.emailOtp({ email: sentTo, otp });
    setPending(false);
    if (result.error) {
      setError(t(`errors.${authErrorKey(result.error)}`));
      return;
    }
    await onDone();
  };

  if (!sentTo) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(email.trim());
        }}
      >
        <Label htmlFor="auth-email">{t('email')}</Label>
        <Input
          id="auth-email"
          type="email"
          required
          // `webauthn` lets the browser offer saved passkeys right in this field.
          autoComplete="email webauthn"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" size="lg" disabled={pending}>
          {t('getCode')}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">{t('codeSent', { email: sentTo })}</p>
      <Label htmlFor="auth-code">{t('code')}</Label>
      <Input
        id="auth-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={OTP_LENGTH + 4}
        className="text-center font-mono text-2xl tracking-[0.5em]"
        value={code}
        disabled={pending}
        onChange={(event) => {
          const next = normalizeOtp(event.target.value);
          setCode(next);
          if (next.length === OTP_LENGTH) {
            verify(next);
          }
        }}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex justify-between text-sm">
        <Button variant="link" size="sm" className="px-0" onClick={() => setSentTo(null)}>
          {t('changeEmail')}
        </Button>
        <Button
          variant="link"
          size="sm"
          className="px-0"
          disabled={wait > 0 || pending}
          onClick={() => send(sentTo)}
        >
          {wait > 0 ? t('resendIn', { seconds: wait }) : t('resend')}
        </Button>
      </div>
    </div>
  );
}
