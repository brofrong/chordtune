'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import { spring } from '@/lib/motion';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { CreateSongMenu } from './create-song-menu';
import { SongCard } from './song-card';

export function SongsBrowser() {
  const t = useTranslations('songs');
  const trpc = useTRPC();
  const [q, setQ] = useState('');
  const query = useDebouncedValue(q.trim(), 200);
  const searching = query.length > 0;

  const popular = useQuery({ ...trpc.songs.list.queryOptions(), enabled: !searching });
  const found = useQuery({
    ...trpc.search.query.queryOptions({ q: query }),
    enabled: searching,
    retry: false,
  });
  const current = searching ? found : popular;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="font-bold font-display text-3xl tracking-tight">{t('title')}</h1>
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 text-muted-foreground transition-[border-color,box-shadow,background-color] focus-within:border-chord/50 focus-within:bg-chord/5 focus-within:shadow-[0_0_0_4px] focus-within:shadow-chord/10">
        <Search className="size-4 shrink-0" />
        <input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      <CreateSongMenu />

      <section className="flex flex-col gap-2">
        <h2 className="flex justify-between px-1 text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
          <span>{searching ? t('results') : t('popular')}</span>
          {searching && current.isSuccess && <span>{current.data.length}</span>}
        </h2>
        {current.isPending ? (
          <ul className="flex flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <li key={index} className="h-[66px] animate-pulse rounded-2xl bg-surface-2" />
            ))}
          </ul>
        ) : current.isError ? (
          <p className="px-1 text-muted-foreground text-sm">{t('searchUnavailable')}</p>
        ) : current.data.length === 0 ? (
          <Link
            href="/songs/new"
            className="px-1 py-4 text-center text-muted-foreground text-sm hover:text-foreground"
          >
            {t('empty')}
          </Link>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout" initial={true}>
              {current.data.map((item, index) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ ...spring.soft, delay: index * 0.045 }}
                >
                  <SongCard item={item} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}
