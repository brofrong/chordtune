'use client';

import { AudioLines, ListMusic } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { type Locale, routing } from '@/i18n/routing';
import { rememberLocale } from '@/lib/locale-preference';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', key: 'tuner', icon: AudioLines },
  { href: '/songs', key: 'songs', icon: ListMusic },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('app');
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="font-semibold tracking-tight">
            {t('name')}
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                  isActive(tab.href) && 'bg-muted text-foreground',
                )}
              >
                {t(`nav.${tab.key}`)}
              </Link>
            ))}
          </nav>
          <LocaleSwitcher className="ml-auto" />
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid h-16 grid-cols-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground transition-colors',
                  active && 'text-primary',
                )}
              >
                <Icon className="size-5" />
                {t(`nav.${tab.key}`)}
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
            'rounded px-1.5 py-0.5 text-xs uppercase text-muted-foreground transition-colors hover:text-foreground',
            item === locale && 'bg-muted text-foreground',
          )}
        >
          {item}
        </Link>
      ))}
    </nav>
  );
}
