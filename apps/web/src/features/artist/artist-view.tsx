'use client';

import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { wikipediaUrl } from '@/features/song/links';
import { ArtistCover, SongCard } from '@/features/songs/song-card';
import { useRouter } from '@/i18n/navigation';
import type { RouterOutputs } from '@/lib/trpc';
import { RelinkButton } from './relink-button';

export type ArtistPage = RouterOutputs['artists']['bySlug'];

/** Profile from Deezer and Wikipedia, then the artist's most viewed songs here. */
export function ArtistView({ artist }: { artist: ArtistPage }) {
  const t = useTranslations('artist');
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const subtitle = [artist.wiki?.description, t('songCount', { count: artist.songCount })]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-32">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('back')}
        className="rounded-xl bg-surface"
        onClick={() => (window.history.length > 1 ? router.back() : router.push('/songs'))}
      >
        <ChevronLeft />
      </Button>

      <header className="flex flex-col items-center gap-3 text-center">
        <ArtistCover
          artist={artist.name}
          picture={artist.pictureUrl}
          className="size-36 rounded-full text-4xl"
        />
        <h1 className="font-bold font-display text-3xl tracking-tight">{artist.name}</h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
        <RelinkButton artist={artist} />
      </header>

      {artist.wiki && (
        <section className="flex flex-col gap-2">
          <p lang={artist.wiki.lang} className={expanded ? undefined : 'line-clamp-4'}>
            {artist.wiki.extract}
          </p>
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="transition-colors hover:text-foreground"
            >
              {expanded ? t('less') : t('more')}
            </button>
            <a
              href={wikipediaUrl(artist.wiki)}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {t('source')}
            </a>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
          {t('songs')}
        </h2>
        {artist.top.length === 0 ? (
          <p className="px-1 text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {artist.top.map((item) => (
              <li key={item.id}>
                <SongCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
