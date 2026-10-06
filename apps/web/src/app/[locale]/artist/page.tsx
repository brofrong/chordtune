import { Suspense } from 'react';

import { ArtistBySlug } from '@/features/artist/artist-by-slug';
import { resolveLocale } from '@/i18n/params';

export default async function ArtistBySlugPage({ params }: PageProps<'/[locale]/artist'>) {
  await resolveLocale(params);
  return (
    <Suspense>
      <ArtistBySlug />
    </Suspense>
  );
}
