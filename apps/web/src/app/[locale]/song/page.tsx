import { Suspense } from 'react';

import { SongById } from '@/features/song/song-by-id';
import { resolveLocale } from '@/i18n/params';

export default async function SongByIdPage({ params }: PageProps<'/[locale]/song'>) {
  await resolveLocale(params);
  return (
    <Suspense>
      <SongById />
    </Suspense>
  );
}
