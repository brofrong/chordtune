import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { ProfileView } from '@/features/profile/profile-view';
import { resolveLocale } from '@/i18n/params';
import { serverTrpc } from '@/lib/trpc-server';

// Route types are generated for `page.tsx` only, so the params of this web-only page are typed by hand.
type Props = { params: Promise<{ locale: string; name: string }> };

const loadProfile = cache(async (username: string) => {
  try {
    return await serverTrpc.profile.byUsername.query({ username });
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const profile = await loadProfile(name);
  return profile
    ? {
        title: `${profile.name} (@${profile.username})`,
        openGraph: { title: profile.name, images: profile.image ? [profile.image] : [] },
      }
    : {};
}

export default async function UserPage({ params }: Props) {
  await resolveLocale(params);
  const { name } = await params;
  const profile = await loadProfile(name);
  if (!profile) {
    notFound();
  }
  // Server-rendered for link previews; `isMe` is false here and the client view refines nothing.
  return <ProfileView profile={profile} />;
}
