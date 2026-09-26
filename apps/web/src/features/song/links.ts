export const isCapacitor = process.env.NEXT_PUBLIC_BUILD_TARGET === 'capacitor';

/** The static Capacitor build cannot have per-song pages, so it reads the id from the query. */
export function songHref(song: { id: string; artistSlug: string; songSlug: string }) {
  return isCapacitor
    ? { pathname: '/song', query: { id: song.id } }
    : `/songs/${song.artistSlug}/${song.songSlug}`;
}
