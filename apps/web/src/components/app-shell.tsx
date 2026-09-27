'use client';

import { AudioLines, Bookmark, ListMusic } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';

import { AccountButton } from '@/features/auth/account-button';
import { Link, usePathname } from '@/i18n/navigation';
import { type Locale, routing } from '@/i18n/routing';
import { rememberLocale } from '@/lib/locale-preference';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', key: 'tuner', icon: AudioLines },
  { href: '/songs', key: 'songs', icon: ListMusic },
  { href: '/library', key: 'library', icon: Bookmark },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('app');
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href ||
        pathname.startsWith(`${href}/`) ||
        (href === '/songs' && pathname === '/song');

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="sticky top-0 z-30 border-border/60 border-b bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-13 max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="font-display font-semibold text-lg tracking-tight">
            {t('name')}
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((tab) => {
              const active = isActive(tab.href);
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative rounded-lg px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground',
                    active && 'text-foreground',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="desktop-tab"
                      transition={spring.soft}
                      className="absolute inset-0 rounded-lg bg-surface-2"
                    />
                  )}
                  <span className="relative">{t(`nav.${tab.key}`)}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            <AccountButton />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      <nav className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 md:hidden">
        <div className="grid h-16 grid-cols-3 rounded-[22px] border border-border bg-popover/80 p-1.5 shadow-lg backdrop-blur-xl">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] text-muted-foreground transition-colors',
                  active && 'text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-tab"
                    transition={spring.soft}
                    className="absolute inset-0 rounded-2xl bg-surface-2"
                  />
                )}
                <Icon className={cn('relative size-5', active && 'text-primary')} />
                <span className="relative">{t(`nav.${tab.key}`)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('app');
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('language')} className={cn('flex gap-0.5', className)}>
      {routing.locales.map((item: Locale) => (
        <Link
          key={item}
          href={pathname}
          locale={item}
          onClick={() => rememberLocale(item)}
          className={cn(
            'rounded px-1.5 py-0.5 text-muted-foreground text-xs uppercase transition-colors hover:text-foreground',
            item === locale && 'bg-muted text-foreground',
          )}
        >
          {item}
        </Link>
      ))}
    </nav>
  );
}
