'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authErrorKey } from '@/features/auth/auth-errors';
import { normalizeOtp, OTP_LENGTH } from '@/features/auth/otp';
import { useSession } from '@/features/auth/use-session';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';

export function EmailSection({ email }: { email: string | null }) {
  const t = useTranslations('security');
  const tAuth = useTranslations('auth');
  const session = useSession();
  const [newEmail, setNewEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (email) {
    return (
      <Section title={t('email')}>
        <span>{email}</span>
      </Section>
    );
  }

  // A taken address is refused up front with `EMAIL_TAKEN` (apps/api create-auth.ts).
  const message = (failure: { code?: string; status?: number }) =>
    tAuth(`errors.${authErrorKey(failure)}`);

  return (
    <Section title={t('addEmail')}>
      {!sent ? (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            const result = await authClient.emailOtp.requestEmailChange({
              newEmail: newEmail.trim(),
            });
            if (result.error) {
              setError(message(result.error));
              return;
            }
            setSent(true);
          }}
        >
          <Input
            type="email"
            required
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Button type="submit">{t('sendCode')}</Button>
        </form>
      ) : (
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder={tAuth('code')}
          value={code}
          onChange={async (event) => {
            const next = normalizeOtp(event.target.value);
            setCode(next);
            if (next.length !== OTP_LENGTH) {
              return;
            }
            const result = await authClient.emailOtp.changeEmail({
              newEmail: newEmail.trim(),
              otp: next,
            });
            if (result.error) {
              setError(message(result.error));
              return;
            }
            await session.refetch();
          }}
        />
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </Section>
  );
}
