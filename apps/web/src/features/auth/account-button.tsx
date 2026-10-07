'use client';

import { LogOut, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ThemeButton, ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from '@/i18n/navigation';
import { useAuthSheet } from './auth-sheet';
import { isPlaceholderEmail } from './placeholder-email';
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
        {user.image ? (
          // A plain img: the static Capacitor export has no image optimizer.
          // biome-ignore lint/performance/noImgElement: see above
          <img src={user.image} alt="" className="size-7 rounded-full" />
        ) : (
          <UserRound />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="flex flex-col gap-0.5 px-1">
          <span className="truncate font-medium">{user.name}</span>
          {!isPlaceholderEmail(user.email) && (
            <span className="truncate text-muted-foreground text-xs">{user.email}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          nativeButton={false}
          render={<Link href="/profile" />}
        >
          <UserRound />
          {t('profile')}
        </Button>
        <ThemeSwitcher />
        <Button variant="ghost" size="sm" className="justify-start" onClick={signOut}>
          <LogOut />
          {t('signOut')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
