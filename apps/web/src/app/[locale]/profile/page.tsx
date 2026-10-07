import { MyProfile } from '@/features/profile/my-profile';
import { resolveLocale } from '@/i18n/params';

export default async function ProfilePage({ params }: PageProps<'/[locale]/profile'>) {
  await resolveLocale(params);
  return <MyProfile />;
}
