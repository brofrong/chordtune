import { TRPCError } from '@trpc/server';

import type { ArrangementDoc } from '../../search';

export type ArrangementListItem = {
  id: string;
  artist: string;
  artistSlug: string;
  title: string;
  songSlug: string;
  chords: string[];
};

export function listItemFromDoc(doc: ArrangementDoc): ArrangementListItem {
  return {
    id: doc.id,
    artist: doc.artist,
    artistSlug: doc.artistSlug,
    title: doc.title,
    songSlug: doc.songSlug,
    chords: doc.chords,
  };
}

/** Search failures surface as SERVICE_UNAVAILABLE so the UI can say «search unavailable». */
export async function fromSearch<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    console.error('Search failed', error);
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'search-unavailable',
      cause: error,
    });
  }
}
