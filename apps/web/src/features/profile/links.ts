import { isCapacitor } from '@/features/song/links';

/** The static Capacitor build has no per-user pages, so it reads the username from the query. */
export function profileHrefFor(username: string, capacitor: boolean) {
  return capacitor ? { pathname: '/u' as const, query: { name: username } } : `/u/${username}`;
}

export function profileHref(username: string) {
  return profileHrefFor(username, isCapacitor);
}
