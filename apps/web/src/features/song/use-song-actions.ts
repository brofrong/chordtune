'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/toast';
import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { tapHaptic } from '@/lib/haptics';
import { type ArrangementView, useTRPC } from '@/lib/trpc';
import { viewerKey } from '@/lib/viewer-key';

type Stats = ArrangementView['stats'];
type Me = NonNullable<ArrangementView['me']>;

export type SongActionHooks = {
  onSaved?: (arrangement: ArrangementView) => void;
  onUnsaved?: (id: string) => void;
  /** Called instead of the server when a play can't be sent (offline). */
  queuePlayed?: (id: string, times: number) => Promise<void>;
  online?: boolean;
};

const EMPTY_ME: Me = { liked: false, saved: false, played: 0 };

/**
 * Likes, saves and plays with optimistic counters: the number changes at once, a failed
 * request puts it back and shows a toast. Guests get the sign-in sheet instead.
 */
export function useSongActions(arrangement: ArrangementView, hooks: SongActionHooks = {}) {
  const t = useTranslations('song');
  const trpc = useTRPC();
  const session = useSession();
  const openAuth = useAuthSheet();
  const toast = useToast();
  const [stats, setStats] = useState<Stats>(arrangement.stats);
  const [me, setMe] = useState<Me>(arrangement.me ?? EMPTY_ME);
  const [pending, setPending] = useState<'like' | 'save' | null>(null);
  const signedIn = Boolean(session.data?.user);
  const online = hooks.online ?? true;

  useEffect(() => {
    setStats(arrangement.stats);
    setMe(arrangement.me ?? EMPTY_ME);
  }, [arrangement]);

  // Server-rendered pages come without the viewer; fetch their likes and plays on the client.
  const mine = useQuery({
    ...trpc.arrangements.byId.queryOptions({ id: arrangement.id }),
    enabled: signedIn && online,
  });
  useEffect(() => {
    if (mine.data?.me) {
      setMe(mine.data.me);
      setStats(mine.data.stats);
    }
  }, [mine.data]);

  const view = useMutation(trpc.arrangements.view.mutationOptions());
  const like = useMutation(trpc.arrangements.like.mutationOptions());
  const unlike = useMutation(trpc.arrangements.unlike.mutationOptions());
  const save = useMutation(trpc.arrangements.save.mutationOptions());
  const unsave = useMutation(trpc.arrangements.unsave.mutationOptions());
  const played = useMutation(trpc.arrangements.played.mutationOptions());

  // Count the view once per mount (StrictMode mounts twice in development).
  const viewed = useRef<string | null>(null);
  const { mutateAsync: sendView } = view;
  useEffect(() => {
    if (viewed.current === arrangement.id || !online) {
      return;
    }
    viewed.current = arrangement.id;
    sendView({ id: arrangement.id, viewerKey: viewerKey() })
      .then(({ views }) => setStats((current) => ({ ...current, views })))
      .catch(() => {});
  }, [arrangement.id, online, sendView]);

  const requireUser = () => {
    if (!signedIn) {
      openAuth();
      return false;
    }
    return true;
  };

  const toggleLike = async () => {
    if (!requireUser() || pending) {
      return;
    }
    const next = !me.liked;
    tapHaptic();
    setPending('like');
    setMe((current) => ({ ...current, liked: next }));
    setStats((current) => ({ ...current, likes: current.likes + (next ? 1 : -1) }));
    try {
      const result = await (next ? like : unlike).mutateAsync({ id: arrangement.id });
      setStats((current) => ({ ...current, likes: result.likes }));
    } catch {
      setMe((current) => ({ ...current, liked: !next }));
      setStats((current) => ({ ...current, likes: current.likes + (next ? -1 : 1) }));
      toast(t('actionFailed'), 'error');
    } finally {
      setPending(null);
    }
  };

  const toggleSave = async () => {
    if (!requireUser() || pending) {
      return;
    }
    const next = !me.saved;
    tapHaptic();
    setPending('save');
    setMe((current) => ({ ...current, saved: next }));
    setStats((current) => ({ ...current, saves: current.saves + (next ? 1 : -1) }));
    try {
      const result = await (next ? save : unsave).mutateAsync({ id: arrangement.id });
      setStats((current) => ({ ...current, saves: result.saves }));
      if (next) {
        hooks.onSaved?.({ ...arrangement, me: { ...me, saved: true } });
      } else {
        hooks.onUnsaved?.(arrangement.id);
      }
    } catch {
      setMe((current) => ({ ...current, saved: !next }));
      setStats((current) => ({ ...current, saves: current.saves + (next ? -1 : 1) }));
      toast(t('actionFailed'), 'error');
      return false;
    } finally {
      setPending(null);
    }
    return next;
  };

  const addPlayed = async (times = 1) => {
    if (!requireUser()) {
      return;
    }
    setMe((current) => ({ ...current, played: current.played + times }));
    if (!online && hooks.queuePlayed) {
      await hooks.queuePlayed(arrangement.id, times);
      return;
    }
    try {
      const result = await played.mutateAsync({ id: arrangement.id, times });
      setMe((current) => ({ ...current, played: result.played }));
    } catch {
      if (hooks.queuePlayed) {
        await hooks.queuePlayed(arrangement.id, times);
      } else {
        setMe((current) => ({ ...current, played: current.played - times }));
        toast(t('actionFailed'), 'error');
      }
    }
  };

  return { stats, me, pending, signedIn, online, toggleLike, toggleSave, addPlayed };
}
