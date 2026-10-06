'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArtistCover } from '@/features/songs/song-card';
import { useRouter } from '@/i18n/navigation';
import { formatCount } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';
import type { ArtistPage } from './artist-view';

/** «Change link» for admins: the artist page itself is rendered without the user's session. */
export function RelinkButton({ artist }: { artist: ArtistPage }) {
  const t = useTranslations('artist');
  const trpc = useTRPC();
  const canEdit = useQuery(trpc.artists.canEdit.queryOptions());
  const [open, setOpen] = useState(false);
  if (!canEdit.data) {
    return null;
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Link2 />
        {t('relink')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-3xl"
        >
          {open && <RelinkForm artist={artist} onDone={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Choice({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-2 text-left text-sm transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}

function RelinkForm({ artist, onDone }: { artist: ArtistPage; onDone: () => void }) {
  const t = useTranslations('artist');
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deezerQ, setDeezerQ] = useState(artist.name);
  const [wikiQ, setWikiQ] = useState(artist.name);
  const [deezerId, setDeezerId] = useState<number | null>(artist.deezerId);
  const [wikidataId, setWikidataId] = useState<string | null>(artist.wikidataId);
  const [error, setError] = useState<string | null>(null);
  const deezerQuery = useDebouncedValue(deezerQ.trim(), 300);
  const wikiQuery = useDebouncedValue(wikiQ.trim(), 300);

  const deezer = useQuery({
    ...trpc.artists.searchDeezer.queryOptions({ q: deezerQuery, includeLinked: true }),
    enabled: deezerQuery.length >= 2,
    retry: false,
  });
  const wiki = useQuery({
    ...trpc.artists.searchWikidata.queryOptions({ q: wikiQuery }),
    enabled: wikiQuery.length > 0,
    retry: false,
  });
  const relink = useMutation(
    trpc.artists.relink.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.artists.bySlug.pathFilter());
        // The web page is rendered on the server; the app's page refetches above.
        router.refresh();
        onDone();
      },
      onError: (failure) => setError(failure.message),
    }),
  );

  return (
    <div className="flex flex-col gap-5 p-4 pt-0">
      <SheetHeader className="px-0">
        <SheetTitle>{t('relinkTitle')}</SheetTitle>
      </SheetHeader>

      <section className="flex flex-col gap-2">
        <Label htmlFor="relink-deezer">{t('relinkDeezer')}</Label>
        <Input id="relink-deezer" value={deezerQ} onChange={(e) => setDeezerQ(e.target.value)} />
        <Choice selected={deezerId === null} onSelect={() => setDeezerId(null)}>
          {t('noPhoto')}
        </Choice>
        {deezer.isError && <p className="text-muted-foreground text-xs">{t('unavailable')}</p>}
        {deezer.data?.map((candidate) => (
          <Choice
            key={candidate.deezerId}
            selected={deezerId === candidate.deezerId}
            onSelect={() => setDeezerId(candidate.deezerId)}
          >
            <ArtistCover
              artist={candidate.name}
              picture={candidate.pictureSmallUrl}
              className="size-9 rounded-full text-xs"
            />
            <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
            <span className="text-muted-foreground text-xs">{formatCount(candidate.fans)}</span>
          </Choice>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="relink-wiki">{t('relinkWikipedia')}</Label>
        <Input id="relink-wiki" value={wikiQ} onChange={(e) => setWikiQ(e.target.value)} />
        <Choice selected={wikidataId === null} onSelect={() => setWikidataId(null)}>
          {t('noArticle')}
        </Choice>
        {wiki.isError && <p className="text-muted-foreground text-xs">{t('unavailable')}</p>}
        {wiki.data?.map((candidate) => (
          <Choice
            key={candidate.wikidataId}
            selected={wikidataId === candidate.wikidataId}
            onSelect={() => setWikidataId(candidate.wikidataId)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{candidate.label}</span>
              {candidate.description && (
                <span className="block truncate text-muted-foreground text-xs">
                  {candidate.description}
                </span>
              )}
            </span>
          </Choice>
        ))}
      </section>

      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button
        disabled={relink.isPending}
        onClick={() => relink.mutate({ id: artist.id, deezerId, wikidataId })}
      >
        {t('save')}
      </Button>
    </div>
  );
}
