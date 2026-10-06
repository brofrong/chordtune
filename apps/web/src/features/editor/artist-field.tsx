'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Label } from '@/components/ui/label';
import { useSession } from '@/features/auth/use-session';
import { ArtistCover } from '@/features/songs/song-card';
import { formatCount } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { SuggestField } from './suggest-field';

export type DeezerPick = { deezerId: number; name: string };

type Option =
  | { kind: 'ours'; id: string; name: string; songCount: number; picture: string | null }
  | { kind: 'deezer'; deezerId: number; name: string; fans: number; picture: string | null }
  | { kind: 'new'; name: string };

const optionKey = (option: Option) =>
  option.kind === 'ours'
    ? option.id
    : option.kind === 'deezer'
      ? `deezer:${option.deezerId}`
      : `new:${option.name}`;

/**
 * Artist name with suggestions: our artists, then Deezer's, then a new one by name. Reports the id
 * of our artist with exactly this name, and a Deezer artist when one is picked.
 */
export function ArtistField({
  value,
  onValueChange,
  onMatch,
  onDeezerPick,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onMatch: (artistId: string | null) => void;
  onDeezerPick: (pick: DeezerPick | null) => void;
}) {
  const t = useTranslations('editor');
  const trpc = useTRPC();
  const session = useSession();
  const typed = value.trim();
  const q = useDebouncedValue(typed, 150);
  const deezerQ = useDebouncedValue(typed, 300);
  const search = useQuery({
    ...trpc.artists.search.queryOptions({ q }),
    enabled: q.length > 0,
    retry: false,
    placeholderData: keepPreviousData,
  });
  // Deezer's quota is per server IP, so the endpoint requires sign-in; signed-out users just see
  // no Deezer group instead of an error.
  const deezer = useQuery({
    ...trpc.artists.searchDeezer.queryOptions({ q: deezerQ }),
    enabled: deezerQ.length >= 2 && Boolean(session.data),
    retry: false,
    placeholderData: keepPreviousData,
  });
  const ours = typed ? (search.data ?? []) : [];
  const exact = ours.find((artist) => artist.name.toLowerCase() === typed.toLowerCase());

  useEffect(() => onMatch(exact?.id ?? null), [exact?.id, onMatch]);

  const items: Option[] = [
    ...ours.map((artist) => ({
      kind: 'ours' as const,
      id: artist.id,
      name: artist.name,
      songCount: artist.songCount,
      picture: artist.pictureSmallUrl,
    })),
    ...(typed.length >= 2 ? (deezer.data ?? []) : []).map((candidate) => ({
      kind: 'deezer' as const,
      deezerId: candidate.deezerId,
      name: candidate.name,
      fans: candidate.fans,
      picture: candidate.pictureSmallUrl,
    })),
    ...(typed && !exact ? [{ kind: 'new' as const, name: typed }] : []),
  ];
  const status = search.isError
    ? t('searchUnavailable')
    : search.isFetching && ours.length === 0 && typed
      ? t('searching')
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="song-artist">{t('artist')}</Label>
      <SuggestField
        id="song-artist"
        value={value}
        onValueChange={onValueChange}
        items={items}
        itemKey={optionKey}
        itemText={(item) => item.name}
        onItemPick={(item) =>
          onDeezerPick(item.kind === 'deezer' ? { deezerId: item.deezerId, name: item.name } : null)
        }
        placeholder={t('artistPlaceholder')}
        status={status}
        renderItem={(item) =>
          item.kind === 'new' ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Plus className="size-4" />
              {t('createArtist', { name: item.name })}
            </span>
          ) : (
            <span className="flex w-full items-center gap-2">
              <ArtistCover
                artist={item.name}
                picture={item.picture}
                className="size-7 rounded-full text-[10px]"
              />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
                {item.kind === 'ours' ? (
                  t('songCount', { count: item.songCount })
                ) : (
                  <>
                    Deezer · <Users className="size-3" />
                    {formatCount(item.fans)}
                  </>
                )}
              </span>
            </span>
          )
        }
      />
    </div>
  );
}
