'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authClient } from '@/lib/auth-client';
import { useSession } from './use-session';

const MODES = ['sign-in', 'sign-up'] as const;
type Mode = (typeof MODES)[number];

const AuthSheetContext = createContext<(mode?: Mode) => void>(() => {});

/** Opens the sign-in sheet from anywhere, e.g. when saving without an account. */
export function useAuthSheet() {
  return useContext(AuthSheetContext);
}

export function AuthSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('sign-in');
  const show = useCallback((next: Mode = 'sign-in') => {
    setMode(next);
    setOpen(true);
  }, []);

  return (
    <AuthSheetContext.Provider value={show}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-xl sm:mb-8 sm:rounded-xl">
          <AuthForm mode={mode} onModeChange={setMode} onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </AuthSheetContext.Provider>
  );
}

function AuthForm({
  mode,
  onModeChange,
  onDone,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onDone: () => void;
}) {
  const t = useTranslations('auth');
  const queryClient = useQueryClient();
  const session = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result =
      mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            email,
            password,
            name: name || email.split('@')[0] || email,
          });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? t('failed'));
      return;
    }
    await session.refetch();
    await queryClient.invalidateQueries();
    onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-4 pt-0">
      <SheetHeader className="px-0">
        <SheetTitle>{t(mode === 'sign-in' ? 'signInTitle' : 'signUpTitle')}</SheetTitle>
        <SheetDescription>{t('description')}</SheetDescription>
      </SheetHeader>
      <Tabs value={mode} onValueChange={(value) => onModeChange(value as Mode)}>
        <TabsList className="w-full">
          {MODES.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="flex-1">
              {t(tab === 'sign-in' ? 'signIn' : 'signUp')}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {mode === 'sign-up' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-name">{t('name')}</Label>
          <Input
            id="auth-name"
            autoComplete="nickname"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auth-email">{t('email')}</Label>
        <Input
          id="auth-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auth-password">{t('password')}</Label>
        <Input
          id="auth-password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" size="lg" disabled={pending}>
        {t(mode === 'sign-in' ? 'signIn' : 'signUp')}
      </Button>
    </form>
  );
}
