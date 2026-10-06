'use client';

import { useQuery } from '@tanstack/react-query';
import { Bookmark, CloudCheck, Heart, LibraryBig, Music } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { isCapacitor } from '@/features/song/links';
import { SongCard } from '@/features/songs/song-card';
import { Link } from '@/i18n/navigation';
import { spring } from '@/lib/motion';
import { type ArrangementListItem, type ArrangementView, useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { listOffline } from './offline-store';
import { OFFLINE_SONGS_KEY } from './offline-sync';

const TABS = ['saved', 'liked', 'mine'] as const;
type Tab = (typeof TABS)[number];

function toListItem(view: ArrangementView): ArrangementListItem {
  return {
    id: view.id,
    artist: view.artist.name,
    artistSlug: view.artist.slug,
    artistPictureSmallUrl: view.artist.pictureSmallUrl,
    title: view.song.title,
    songSlug: view.song.slug,
    views: view.stats.views,
    likes: view.stats.likes,
  };
}

export function LibraryView() {
  const t = useTranslations('library');
  const trpc = useTRPC();
  const session = useSession();
  const openAuth = useAuthSheet();
  const [tab, setTab] = useState<Tab>('saved');
  const signedIn = Boolean(session.data?.user);

  // In the app the saved list comes from the device, so it works offline.
  const savedOffline = useQuery({
    queryKey: OFFLINE_SONGS_KEY,
    queryFn: listOffline,
    enabled: isCapacitor,
  });
  const savedRemote = useQuery({
    ...trpc.library.saved.queryOptions(),
    enabled: signedIn && !isCapacitor,
  });
  const liked = useQuery({
    ...trpc.library.liked.queryOptions(),
    enabled: signedIn && tab === 'liked',
  });
  const mine = useQuery({
    ...trpc.library.mine.queryOptions(),
    enabled: signedIn && tab === 'mine',
  });

  const saved = isCapacitor ? savedOffline : savedRemote;
  const current =
    tab === 'saved'
      ? { ...saved, data: saved.data?.map(toListItem) }
      : tab === 'liked'
        ? liked
        : mine;

  if (!session.isPending && !signedIn && !(isCapacitor && savedOffline.data?.length)) {
    return (
      <Shell>
        <Empty icon={LibraryBig} title={t('signInTitle')} hint={t('signInHint')}>
          <Button onClick={() => openAuth()}>{t('signIn')}</Button>
        </Empty>
      </Shell>
    );
  }

  const empty = {
    saved: { icon: Bookmark, text: t('emptySaved'), link: '/songs', action: t('browse') },
    liked: { icon: Heart, text: t('emptyLiked'), link: '/songs', action: t('browse') },
    mine: { icon: Music, text: t('emptyMine'), link: '/songs/new', action: t('add') },
  }[tab];

  return (
    <Shell>
      <div className="flex rounded-2xl bg-surface p-1">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
            className={cn(
              'relative flex-1 rounded-xl py-2 font-medium text-muted-foreground text-sm transition-colors',
              tab === item && 'text-foreground',
            )}
          >
            {tab === item && (
              <motion.span
                layoutId="library-tab"
                transition={spring.soft}
                className="absolute inset-0 rounded-xl bg-surface-2 shadow-sm"
              />
            )}
            <span className="relative">{t(item)}</span>
          </button>
        ))}
      </div>

      {current.isPending && (current.fetchStatus !== 'idle' || isCapacitor) ? (
        <ul className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <li key={index} className="h-[66px] animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </ul>
      ) : current.isError ? (
        <p className="text-muted-foreground text-sm">{t('loadFailed')}</p>
      ) : !current.data?.length ? (
        <Empty icon={empty.icon} title={empty.text}>
          <Button variant="outline" nativeButton={false} render={<Link href={empty.link} />}>
            {empty.action}
          </Button>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout" initial={true}>
            {current.data.map((item, index) => (
              <motion.li
                key={`${tab}:${item.id}`}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ ...spring.soft, delay: index * 0.045 }}
              >
                <SongCard
                  item={item}
                  badge={
                    tab === 'saved' && isCapacitor ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-saved/15 px-1.5 text-saved text-xs">
                        <CloudCheck className="size-3" />
                        {t('offline')}
                      </span>
                    ) : null
                  }
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('library');
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="font-bold font-display text-3xl tracking-tight">{t('title')}</h1>
      {children}
    </div>
  );
}

function Empty({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Bookmark;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="flex flex-col items-center gap-3 rounded-3xl border border-border border-dashed px-6 py-10 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <p className="max-w-xs font-medium">{title}</p>
      {hint && <p className="max-w-xs text-muted-foreground text-sm">{hint}</p>}
      {children}
    </motion.div>
  );
}
