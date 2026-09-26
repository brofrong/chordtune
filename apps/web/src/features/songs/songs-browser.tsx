'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { songHref } from '@/features/song/links';
import { Link } from '@/i18n/navigation';
import { type ArrangementListItem, useTRPC } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export function SongsBrowser() {
  const t = useTranslations('songs');
  const trpc = useTRPC();
  const [q, setQ] = useState('');
  const query = useDebouncedValue(q.trim(), 200);
  const searching = query.length > 0;

  const recent = useQuery({ ...trpc.songs.list.queryOptions(), enabled: !searching });
  const found = useQuery({
    ...trpc.search.query.queryOptions({ q: query }),
    enabled: searching,
    retry: false,
  });
  const current = searching ? found : recent;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
        <Button nativeButton={false} render={<Link href="/songs/new" />}>
          <Plus />
          {t('add')}
        </Button>
      </div>
      <div className="relative">
        <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className="h-11 pl-9"
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs uppercase tracking-wide">
          {searching ? t('results') : t('recent')}
        </h2>
        {current.isPending ? (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        ) : current.isError ? (
          <p className="text-muted-foreground text-sm">{t('searchUnavailable')}</p>
        ) : current.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {current.data.map((item) => (
              <SongRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SongRow({ item }: { item: ArrangementListItem }) {
  return (
    <li>
      <Link
        href={songHref(item)}
        className="flex flex-col gap-0.5 py-3 transition-colors hover:text-primary"
      >
        <span className="font-medium">{item.title}</span>
        <span className="flex flex-wrap items-baseline gap-x-3 text-muted-foreground text-sm">
          <span>{item.artist}</span>
          <span className="font-mono text-xs">{item.chords.slice(0, 8).join(' ')}</span>
        </span>
      </Link>
    </li>
  );
}
