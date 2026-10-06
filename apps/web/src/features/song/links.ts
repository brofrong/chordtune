export const isCapacitor = process.env.NEXT_PUBLIC_BUILD_TARGET === 'capacitor';

/** The static Capacitor build cannot have per-song pages, so it reads the id from the query. */
export function songHref(song: { id: string; artistSlug: string; songSlug: string }) {
  return isCapacitor
    ? { pathname: '/song', query: { id: song.id } }
    : `/songs/${song.artistSlug}/${song.songSlug}`;
}

/** Like `songHref`: the static build has one artist page that reads the slug from the query. */
export function artistHref(artist: { slug: string }, capacitor = isCapacitor) {
  return capacitor
    ? { pathname: '/artist', query: { slug: artist.slug } }
    : `/artists/${artist.slug}`;
}

export function wikipediaUrl({ lang, title }: { lang: string; title: string }) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
}
