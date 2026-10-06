'use client';

import { Eye, Heart } from 'lucide-react';
import { useState } from 'react';

import { songHref } from '@/features/song/links';
import { Link } from '@/i18n/navigation';
import { formatCount } from '@/lib/format';
import type { ArrangementListItem } from '@/lib/trpc';
import { coverColors, initials } from './cover';

/** The artist's picture over its initials cover, which stays when there is none or it fails to load. */
export function ArtistCover({
  artist,
  picture,
  className,
}: {
  artist: string;
  picture?: string | null;
  className?: string;
}) {
  const [from, to] = coverColors(artist);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center overflow-hidden font-bold text-sm text-white tracking-tight ${className ?? 'size-11 rounded-[13px]'}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials(artist)}
      {picture && failed !== picture && (
        // A plain img: the static Capacitor export has no image optimizer.
        // biome-ignore lint/performance/noImgElement: see above
        <img
          src={picture}
          alt=""
          loading="lazy"
          onError={() => setFailed(picture)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

/** A song in a list: cover, title, artist and compact counters — no chords. */
export function SongCard({ item, badge }: { item: ArrangementListItem; badge?: React.ReactNode }) {
  return (
    <Link
      href={songHref(item)}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 transition-[background-color,transform] hover:bg-surface-2 active:scale-[0.99]"
    >
      <ArtistCover artist={item.artist} picture={item.artistPictureSmallUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.title}</span>
        <span className="flex items-center gap-2 truncate text-muted-foreground text-sm">
          {item.artist}
          {badge}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 text-muted-foreground text-xs tabular-nums">
        <span className="inline-flex items-center gap-1">
          <Eye className="size-3" />
          {formatCount(item.views)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart className="size-3" />
          {formatCount(item.likes)}
        </span>
      </span>
    </Link>
  );
}
