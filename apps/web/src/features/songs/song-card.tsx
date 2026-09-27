import { Eye, Heart } from 'lucide-react';

import { songHref } from '@/features/song/links';
import { Link } from '@/i18n/navigation';
import { formatCount } from '@/lib/format';
import type { ArrangementListItem } from '@/lib/trpc';
import { coverColors, initials } from './cover';

export function ArtistCover({ artist, className }: { artist: string; className?: string }) {
  const [from, to] = coverColors(artist);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-bold text-sm text-white tracking-tight ${className ?? 'size-11 rounded-[13px]'}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials(artist)}
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
      <ArtistCover artist={item.artist} />
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
