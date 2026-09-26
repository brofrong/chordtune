import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { SongView } from '@/features/song/song-view';
import { resolveLocale } from '@/i18n/params';
import { serverTrpc } from '@/lib/trpc-server';

// Route types are generated for `page.tsx` only, so the params of this web-only page are typed by hand.
type SongPageProps = { params: Promise<{ locale: string; artist: string; song: string }> };

const loadSong = cache(async (artistSlug: string, songSlug: string) => {
  try {
    return await serverTrpc.arrangements.bySlug.query({ artistSlug, songSlug });
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: SongPageProps): Promise<Metadata> {
  const { artist, song } = await params;
  const arrangement = await loadSong(artist, song);
  return arrangement ? { title: `${arrangement.song.title} — ${arrangement.artist.name}` } : {};
}

export default async function SongPage({ params }: SongPageProps) {
  await resolveLocale(params);
  const { artist, song } = await params;
  const arrangement = await loadSong(artist, song);
  if (!arrangement) {
    notFound();
  }
  return <SongView arrangement={arrangement} />;
}
