'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { normalizeUsernameInput, usernameProblem } from './username-input';

export function ProfileEdit() {
  const t = useTranslations('profile.editForm');
  const tProfile = useTranslations('profile');
  const trpc = useTRPC();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const openAuth = useAuthSheet();
  const signedIn = Boolean(session.data?.user);
  const profile = useQuery({ ...trpc.profile.me.queryOptions(), enabled: signedIn });
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!session.isPending && !signedIn) {
      openAuth();
    }
  }, [openAuth, session.isPending, signedIn]);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setUsername(profile.data.username);
    }
  }, [profile.data]);

  const checked = useDebouncedValue(username, 400);
  const problem = usernameProblem(username);
  // Only query availability once the debounced value settles on something other than the
  // profile's own username — otherwise every edit page load would spend a round trip confirming
  // that a user's own name is "taken" by themselves.
  const changed = Boolean(profile.data) && checked !== profile.data?.username;
  const availability = useQuery({
    queryKey: ['username-available', checked],
    queryFn: async () =>
      (await authClient.isUsernameAvailable({ username: checked })).data?.available ?? false,
    enabled: changed && !usernameProblem(checked),
  });

  const save = async () => {
    setPending(true);
    const result = await authClient.updateUser({ name: name.trim(), username });
    setPending(false);
    if (result.error) {
      // USERNAME_IS_ALREADY_TAKEN races the availability check (someone else grabbed it between
      // the check and the save); anything else (short/invalid/network) is a generic failure —
      // the local usernameProblem check already blocks the common invalid cases before submit.
      toast(result.error.code === 'USERNAME_IS_ALREADY_TAKEN' ? t('taken') : t('failed'), 'error');
      return;
    }
    await session.refetch();
    await queryClient.invalidateQueries();
    toast(t('saved'));
    router.push('/profile');
  };

  if (!signedIn) {
    return null;
  }
  if (profile.isError) {
    return <p className="p-8 text-center text-muted-foreground">{tProfile('loadFailed')}</p>;
  }
  if (profile.isPending) {
    return <p className="p-8 text-center text-muted-foreground">{tProfile('loading')}</p>;
  }

  const unavailable = changed && !problem && availability.data === false;
  const hint = problem
    ? t(problem)
    : unavailable
      ? t('taken')
      : changed && availability.data
        ? t('available')
        : t('usernameHint');

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h1 className="font-display font-semibold text-xl">{t('title')}</h1>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">{t('name')}</Label>
        <Input
          id="profile-name"
          required
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-username">{t('username')}</Label>
        <Input
          id="profile-username"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(event) => setUsername(normalizeUsernameInput(event.target.value))}
        />
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <Button type="submit" size="lg" disabled={pending || Boolean(problem) || unavailable}>
        {t('save')}
      </Button>
    </form>
  );
}
