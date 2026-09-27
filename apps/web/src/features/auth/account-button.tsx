'use client';

import { LogOut, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ThemeButton, ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuthSheet } from './auth-sheet';
import { useSession, useSignOut } from './use-session';

export function AccountButton() {
  const t = useTranslations('auth');
  const session = useSession();
  const openAuth = useAuthSheet();
  const signOut = useSignOut();
  const user = session.data?.user;

  if (session.isPending) {
    return <div className="size-7" />;
  }
  if (!user) {
    return (
      <span className="flex items-center gap-1">
        <ThemeButton />
        <Button variant="ghost" size="sm" onClick={() => openAuth()}>
          {t('signIn')}
        </Button>
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('account')} />}>
        <UserRound />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="flex flex-col gap-0.5 px-1">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-muted-foreground text-xs">{user.email}</span>
        </div>
        <ThemeSwitcher />
        <Button variant="ghost" size="sm" className="justify-start" onClick={signOut}>
          <LogOut />
          {t('signOut')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
