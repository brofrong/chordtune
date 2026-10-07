'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Pencil, Shield } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SongCard } from '@/features/songs/song-card';
import { Link } from '@/i18n/navigation';
import { type Profile, useTRPC } from '@/lib/trpc';
import { Avatar } from './avatar';

export function ProfileView({ profile }: { profile: Profile }) {
  const t = useTranslations('profile');
  const format = useFormatter();
  const trpc = useTRPC();
  const list = useInfiniteQuery(
    trpc.profile.arrangements.infiniteQueryOptions(
      { userId: profile.id },
      { getNextPageParam: (page) => page.nextCursor },
    ),
  );
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-4">
        <Avatar name={profile.name} image={profile.image} className="size-20 text-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="truncate font-display font-semibold text-2xl">{profile.name}</h1>
          <span className="text-muted-foreground">@{profile.username}</span>
          <span className="text-muted-foreground text-xs">
            {t('since', {
              date: format.dateTime(profile.createdAt, { year: 'numeric', month: 'long' }),
            })}
          </span>
        </div>
        {profile.isMe && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('edit')}
              nativeButton={false}
              render={<Link href="/profile/edit" />}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('security')}
              nativeButton={false}
              render={<Link href="/profile/security" />}
            >
              <Shield />
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>{t('arrangements', { count: profile.stats.arrangements })}</span>
        <span>{t('likes', { count: profile.stats.likes })}</span>
        <span>{t('saves', { count: profile.stats.saves })}</span>
      </div>

      {list.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-[66px] animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      ) : list.isError ? (
        <p className="text-muted-foreground text-sm">{t('loadFailed')}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <SongCard
                key={item.id}
                item={item}
                badge={
                  item.status === 'draft' ? (
                    <Badge variant="secondary">{t('draft')}</Badge>
                  ) : undefined
                }
              />
            ))}
          </div>
          {list.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {t('more')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
