'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { SuggestField } from './suggest-field';

type Option = { id: string | null; name: string; songCount: number };

/** Artist name with suggestions; reports the id of an existing artist with exactly this name. */
export function ArtistField({
  value,
  onValueChange,
  onMatch,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onMatch: (artistId: string | null) => void;
}) {
  const t = useTranslations('editor');
  const trpc = useTRPC();
  const typed = value.trim();
  const q = useDebouncedValue(typed, 150);
  const search = useQuery({
    ...trpc.artists.search.queryOptions({ q }),
    enabled: q.length > 0,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const results: Option[] = typed ? (search.data ?? []) : [];
  const exact = results.find((artist) => artist.name.toLowerCase() === typed.toLowerCase());

  useEffect(() => onMatch(exact?.id ?? null), [exact?.id, onMatch]);

  const items: Option[] =
    typed && !exact ? [...results, { id: null, name: typed, songCount: 0 }] : results;
  const status = search.isError
    ? t('searchUnavailable')
    : search.isFetching && results.length === 0 && typed
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
        itemKey={(item) => item.id ?? `new:${item.name}`}
        itemText={(item) => item.name}
        placeholder={t('artistPlaceholder')}
        status={status}
        renderItem={(item) =>
          item.id === null ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Plus className="size-4" />
              {t('createArtist', { name: item.name })}
            </span>
          ) : (
            <span className="flex w-full items-baseline justify-between gap-2">
              <span>{item.name}</span>
              <span className="text-muted-foreground text-xs">
                {t('songCount', { count: item.songCount })}
              </span>
            </span>
          )
        }
      />
    </div>
  );
}
