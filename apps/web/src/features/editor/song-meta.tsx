'use client';

import type { CapoHint } from '@chordtune/audio';
import { SONG_TUNING_IDS, songTuning } from '@chordtune/chord-sheet';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_BPM } from '@/features/rhythm/playback';
import { ArtistCover } from '@/features/songs/song-card';
import { ArtistField, type DeezerPick } from './artist-field';
import { SongTitleField } from './song-title-field';
import type { Draft } from './use-draft';

export type SongFields = Omit<Draft, 'content'>;

export const MIN_TEMPO = 30;
export const MAX_TEMPO = 300;
export const MAX_NOTES = 5_000;
const CAPO_FRETS = Array.from({ length: 13 }, (_, fret) => fret);

/** The song's details folded into one line; tap to open the sheet with the fields. */
export function SongMetaCard({ fields, onOpen }: { fields: SongFields; onOpen: () => void }) {
  const t = useTranslations('editor');
  const tTuner = useTranslations('tuner');
  const empty = !fields.title.trim() && !fields.artist.trim();
  const details = [
    fields.artist.trim(),
    fields.tuning !== 'standard' ? tTuner(`tunings.guitar.${fields.tuning}`) : null,
    fields.capo ? `Capo ${fields.capo}` : null,
    fields.tempo ? `${fields.tempo} BPM` : null,
    fields.key.trim() || null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 text-left transition-colors hover:bg-surface-2"
    >
      {empty ? (
        <span className="flex size-11 items-center justify-center rounded-[13px] border border-border border-dashed text-muted-foreground">
          ?
        </span>
      ) : (
        <ArtistCover artist={fields.artist || fields.title} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display font-semibold text-lg leading-tight">
          {fields.title.trim() || t('metaPlaceholder')}
        </span>
        <span className="block truncate text-muted-foreground text-sm">
          {details.length > 0 ? details.join(' · ') : t('metaHint')}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}

export function SongMetaSheet({
  open,
  onOpenChange,
  fields,
  onChange,
  capoHints,
  pendingCapo,
  onCapoPick,
  onRecalculate,
  onKeepWritten,
  artistId,
  onArtistMatch,
  onDeezerPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: SongFields;
  onChange: (patch: Partial<SongFields>) => void;
  capoHints: CapoHint[] | null;
  pendingCapo: { to: number; unreachable: number; brokenTabs: number } | null;
  onCapoPick: (capo: number | null) => void;
  onRecalculate: () => void;
  onKeepWritten: () => void;
  artistId: string | null;
  onArtistMatch: (id: string | null) => void;
  onDeezerPick: (pick: DeezerPick | null) => void;
}) {
  const t = useTranslations('editor');
  const tTuner = useTranslations('tuner');
  const capoItems = CAPO_FRETS.map((fret) => {
    const hint = capoHints?.find((item) => item.capo === fret);
    const base = fret === 0 ? t('noCapo') : String(fret);
    const tags = [hint?.star ? '★' : null, hint?.noBarre ? t('noBarre') : null].filter(Boolean);
    return { value: String(fret), label: tags.length > 0 ? `${base} · ${tags.join(' · ')}` : base };
  });
  const tuningItems = SONG_TUNING_IDS.map((id) => ({
    value: id,
    label: tTuner(`tunings.guitar.${id}`),
  }));
  const zenItems = [
    { value: 'auto', label: t('zenAuto') },
    { value: 'inline', label: t('zenInline') },
    { value: 'strip', label: t('zenStrip') },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-3xl"
      >
        <div className="flex flex-col gap-4 p-4 pt-0">
          <SheetHeader className="px-0">
            <SheetTitle>{t('metaTitle')}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <ArtistField
              value={fields.artist}
              onValueChange={(artist) => onChange({ artist })}
              onMatch={onArtistMatch}
              onDeezerPick={onDeezerPick}
            />
            <SongTitleField
              value={fields.title}
              onValueChange={(title) => onChange({ title })}
              artistId={artistId}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('tuning')}</Label>
              <Select
                value={fields.tuning}
                items={tuningItems}
                onValueChange={(value) => onChange({ tuning: songTuning(value).id })}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tuningItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('capo')}</Label>
              <Select
                value={String(pendingCapo?.to ?? fields.capo ?? 0)}
                items={capoItems}
                onValueChange={(value) => onCapoPick(Number(value) || null)}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {capoItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="song-bpm">{t('bpm')}</Label>
              <Input
                id="song-bpm"
                type="number"
                inputMode="numeric"
                min={MIN_TEMPO}
                max={MAX_TEMPO}
                placeholder={String(DEFAULT_BPM)}
                className="h-10"
                value={fields.tempo ?? ''}
                onChange={(event) =>
                  onChange({ tempo: event.target.value ? Number(event.target.value) : null })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="song-key">{t('key')}</Label>
              <Input
                id="song-key"
                maxLength={8}
                placeholder={t('keyPlaceholder')}
                className="h-10"
                value={fields.key}
                onChange={(event) => onChange({ key: event.target.value })}
              />
            </div>
          </div>
          {pendingCapo && (
            <div className="flex flex-col gap-2 rounded-2xl border border-chord/40 bg-chord/5 p-3 text-sm">
              <p>{t('recalcCapo', { fret: pendingCapo.to })}</p>
              {pendingCapo.unreachable > 0 && (
                <p className="text-destructive text-xs">
                  {t('recalcBlocked', { count: pendingCapo.unreachable })}
                </p>
              )}
              {pendingCapo.brokenTabs > 0 && (
                <p className="text-destructive text-xs">{t('recalcTabError')}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pendingCapo.unreachable > 0 || pendingCapo.brokenTabs > 0}
                  onClick={onRecalculate}
                >
                  {t('recalc')}
                </Button>
                <Button size="sm" variant="outline" onClick={onKeepWritten}>
                  {t('keepWritten')}
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="song-notes">{t('notes')}</Label>
            <Textarea
              id="song-notes"
              maxLength={MAX_NOTES}
              placeholder={t('notesPlaceholder')}
              value={fields.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('zenMode')}</Label>
            <Select
              value={fields.zenMode ?? 'auto'}
              items={zenItems}
              onValueChange={(value) =>
                onChange({ zenMode: value === 'inline' || value === 'strip' ? value : null })
              }
            >
              <SelectTrigger className="h-10 w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {zenItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
