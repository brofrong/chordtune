'use client';

import { ChevronLeft, Ellipsis, Link2, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSession } from '@/features/auth/use-session';
import { Link, useRouter } from '@/i18n/navigation';
import type { ArrangementView } from '@/lib/trpc';

export function SongHeader({ arrangement }: { arrangement: ArrangementView }) {
  const t = useTranslations('song');
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const isAuthor = Boolean(arrangement.author) && session.data?.user.id === arrangement.author?.id;

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('back')}
        className="rounded-xl bg-surface"
        onClick={() => (window.history.length > 1 ? router.back() : router.push('/songs'))}
      >
        <ChevronLeft />
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('more')}
              className="rounded-xl bg-surface"
            />
          }
        >
          <Ellipsis />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 gap-1 p-1.5">
          {isAuthor && (
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              nativeButton={false}
              render={<Link href={{ pathname: '/songs/new', query: { edit: arrangement.id } }} />}
            >
              <Pencil />
              {t('edit')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={async () => {
              await navigator.clipboard?.writeText(window.location.href).catch(() => {});
              toast(t('linkCopied'));
            }}
          >
            <Link2 />
            {t('copyLink')}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
