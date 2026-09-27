'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

const THEMES = [
  { id: 'system', icon: Monitor },
  { id: 'dark', icon: Moon },
  { id: 'light', icon: Sun },
] as const;

const subscribe = () => () => {};

/** The theme is only known on the client; render nothing until then to avoid a mismatch. */
function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/** System / dark / light as a segmented control with a sliding highlight. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useTranslations('app.theme');
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <fieldset className={cn('flex min-w-0 gap-0.5 rounded-xl bg-muted p-0.5', className)}>
      <legend className="sr-only">{t('title')}</legend>
      {THEMES.map(({ id, icon: Icon }) => {
        const active = mounted && theme === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            aria-label={t(id)}
            onClick={() => setTheme(id)}
            className={cn(
              'relative flex h-7 flex-1 items-center justify-center rounded-[10px] px-2.5 text-muted-foreground transition-colors',
              active && 'text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-pill"
                transition={spring.soft}
                className="absolute inset-0 rounded-[10px] bg-background shadow-sm"
              />
            )}
            <Icon className="relative size-4" />
          </button>
        );
      })}
    </fieldset>
  );
}

/** For guests: the current theme icon opening the switcher. */
export function ThemeButton() {
  const t = useTranslations('app.theme');
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();
  const Icon = mounted && resolvedTheme === 'light' ? Sun : Moon;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('title')} />}>
        <Icon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto">
        <ThemeSwitcher className="w-36" />
      </PopoverContent>
    </Popover>
  );
}
