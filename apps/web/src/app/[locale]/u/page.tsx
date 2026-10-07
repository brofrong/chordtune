import { Suspense } from 'react';

import { ProfileByQuery } from '@/features/profile/profile-by-name';
import { resolveLocale } from '@/i18n/params';

export default async function UserByQueryPage({ params }: PageProps<'/[locale]/u'>) {
  await resolveLocale(params);
  return (
    <Suspense>
      <ProfileByQuery />
    </Suspense>
  );
}
