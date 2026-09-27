'use client';

import { ClipboardPaste } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { saveDraft } from '@/features/editor/use-draft';
import { useRouter } from '@/i18n/navigation';
import { draftFromNote } from './draft-from-note';

export function PasteNoteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('songs');
  const router = useRouter();
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  const canReadClipboard =
    typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

  const submit = (value: string) => {
    const draft = draftFromNote(value);
    if (!draft) {
      setFailed(true);
      return;
    }
    saveDraft(draft);
    onOpenChange(false);
    router.push('/songs/new');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl sm:mb-8 sm:rounded-3xl">
        <div className="flex flex-col gap-3 p-4 pt-0">
          <SheetHeader className="px-0">
            <SheetTitle>{t('pasteTitle')}</SheetTitle>
          </SheetHeader>
          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFailed(false);
            }}
            placeholder={t('pastePlaceholder')}
            spellCheck={false}
            className="min-h-48 font-mono text-sm"
          />
          {failed && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-destructive">{t('pasteFailed')}</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => {
                  onOpenChange(false);
                  router.push('/songs/new');
                }}
              >
                {t('openEmpty')}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            {canReadClipboard && (
              <Button
                variant="outline"
                onClick={async () => {
                  const pasted = await navigator.clipboard.readText().catch(() => '');
                  setText(pasted);
                  if (pasted) {
                    submit(pasted);
                  }
                }}
              >
                <ClipboardPaste />
                {t('pasteFromClipboard')}
              </Button>
            )}
            <Button className="ml-auto" disabled={!text.trim()} onClick={() => submit(text)}>
              {t('pasteContinue')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
