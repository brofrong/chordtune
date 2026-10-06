import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { ArtistView } from '@/features/artist/artist-view';
import { resolveLocale } from '@/i18n/params';
import type { Locale } from '@/i18n/routing';
import { serverTrpc } from '@/lib/trpc-server';

// Route types are generated for `page.tsx` only, so the params of this web-only page are typed by hand.
type ArtistPageProps = { params: Promise<{ locale: string; slug: string }> };

const loadArtist = cache(async (slug: string, locale: Locale) => {
  try {
    return await serverTrpc.artists.bySlug.query({ slug, locale });
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  const artist = await loadArtist(slug, locale);
  return artist ? { title: artist.name } : {};
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  const artist = await loadArtist(slug, locale);
  if (!artist) {
    notFound();
  }
  return <ArtistView key={artist.id} artist={artist} />;
}
