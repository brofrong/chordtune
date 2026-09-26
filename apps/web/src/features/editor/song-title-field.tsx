'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { SuggestField } from './suggest-field';

/** Song title with suggestions from the chosen artist's songs. */
export function SongTitleField({
  value,
  onValueChange,
  artistId,
}: {
  value: string;
  onValueChange: (value: string) => void;
  artistId: string | null;
}) {
  const t = useTranslations('editor');
  const trpc = useTRPC();
  const typed = value.trim();
  const q = useDebouncedValue(typed, 150);
  const search = useQuery({
    ...trpc.songs.searchByArtist.queryOptions({ artistId: artistId ?? '', q }),
    enabled: artistId !== null,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const songs = artistId ? (search.data ?? []) : [];
  const exists = songs.some((song) => song.title.toLowerCase() === typed.toLowerCase());

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="song-title">{t('title')}</Label>
      <SuggestField
        id="song-title"
        value={value}
        onValueChange={onValueChange}
        items={songs}
        itemKey={(song) => song.songId}
        itemText={(song) => song.title}
        placeholder={t('titlePlaceholder')}
        status={search.isError ? t('searchUnavailable') : null}
        renderItem={(song) => song.title}
      />
      {exists && typed && <p className="text-muted-foreground text-xs">{t('existingSong')}</p>}
    </div>
  );
}
