'use client';

import {
  chordList,
  type ImportedSong,
  parse,
  type SongDoc,
  serialize,
} from '@chordtune/chord-sheet';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

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
import { Textarea } from '@/components/ui/textarea';
import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { DEFAULT_BPM } from '@/features/rhythm/playback';
import { RhythmList } from '@/features/rhythm/rhythm-list';
import { useStrumPlayer } from '@/features/rhythm/use-strum-player';
import { songHref } from '@/features/song/links';
import { Link, useRouter } from '@/i18n/navigation';
import { useTRPC } from '@/lib/trpc';
import { ArtistField } from './artist-field';
import { ChordEditor, unknownRhythmKeys } from './chord-editor';
import { SongTitleField } from './song-title-field';
import { clearDraft, type Draft, EMPTY_DRAFT, loadDraft, saveDraft } from './use-draft';

type Fields = Omit<Draft, 'content'>;

const { content: _emptyContent, ...EMPTY_FIELDS } = EMPTY_DRAFT;
const CAPO_FRETS = Array.from({ length: 13 }, (_, fret) => fret);
const MIN_TEMPO = 30;
const MAX_TEMPO = 300;
const MAX_NOTES = 5_000;

export function SongForm() {
  const t = useTranslations('editor');
  const trpc = useTRPC();
  const router = useRouter();
  const session = useSession();
  const openAuth = useAuthSheet();
  const player = useStrumPlayer();

  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [doc, setDoc] = useState<SongDoc>(() => parse('').doc);
  const [docVersion, setDocVersion] = useState(0);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [restored, setRestored] = useState(false);

  const replaceDoc = (next: SongDoc) => {
    setDoc(next);
    setDocVersion((version) => version + 1);
  };

  // The draft lives in localStorage, so it can only be read after hydration.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      const { content, ...rest } = draft;
      setFields(rest);
      replaceDoc(parse(content).doc);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) {
      return;
    }
    const timer = setTimeout(() => saveDraft({ ...fields, content: serialize(doc) }), 400);
    return () => clearTimeout(timer);
  }, [fields, doc, restored]);

  const update = (patch: Partial<Fields>) => setFields((current) => ({ ...current, ...patch }));
  const chords = useMemo(() => chordList(doc), [doc]);
  const bpm = fields.tempo ?? DEFAULT_BPM;

  const create = useMutation(
    trpc.arrangements.create.mutationOptions({
      onSuccess: (saved) => {
        clearDraft();
        router.push(songHref(saved));
      },
      onError: (failure) => setError(t('saveFailed', { message: failure.message })),
    }),
  );

  const importSong = (song: ImportedSong) => {
    setFields((current) => ({
      ...current,
      artist: song.artist || current.artist,
      title: song.title || current.title,
      capo: song.capo,
      tempo: song.tempo,
      notes: song.notes.slice(0, MAX_NOTES),
      rhythms: song.rhythms,
    }));
    replaceDoc(parse(song.content).doc);
    setImported(true);
  };

  const save = () => {
    setError(null);
    const artist = fields.artist.trim();
    const title = fields.title.trim();
    if (!artist || !title) {
      setError(t('required'));
      return;
    }
    if (unknownRhythmKeys(doc, fields.rhythms).length > 0) {
      // The editor already lists these errors.
      return;
    }
    if (!session.data) {
      openAuth();
      return;
    }
    create.mutate({
      artist: { name: artist },
      song: { title },
      content: serialize(doc),
      rhythms: fields.rhythms,
      capo: fields.capo || null,
      tempo: fields.tempo === null ? null : Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, fields.tempo)),
      key: fields.key.trim() || null,
      notes: fields.notes,
    });
  };

  const capoItems = CAPO_FRETS.map((fret) => ({
    value: String(fret),
    label: fret === 0 ? t('noCapo') : String(fret),
  }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('back')}
          nativeButton={false}
          render={<Link href="/songs" />}
        >
          <ArrowLeft />
        </Button>
        <h1 className="font-semibold text-xl tracking-tight">{t('newTitle')}</h1>
        <Button className="ml-auto" onClick={save} disabled={create.isPending}>
          {create.isPending ? t('saving') : t('save')}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {imported && <p className="text-muted-foreground text-sm">{t('imported')}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <ArtistField
          value={fields.artist}
          onValueChange={(artist) => update({ artist })}
          onMatch={setArtistId}
        />
        <SongTitleField
          value={fields.title}
          onValueChange={(title) => update({ title })}
          artistId={artistId}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t('capo')}</Label>
          <Select
            value={String(fields.capo ?? 0)}
            items={capoItems}
            onValueChange={(value) => update({ capo: Number(value) || null })}
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
              update({ tempo: event.target.value ? Number(event.target.value) : null })
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
            onChange={(event) => update({ key: event.target.value })}
          />
        </div>
      </div>

      <RhythmList
        rhythms={fields.rhythms}
        onChange={(rhythms) => update({ rhythms })}
        chords={chords}
        bpm={bpm}
        player={player}
      />

      <ChordEditor
        doc={doc}
        docVersion={docVersion}
        onDocChange={setDoc}
        onImport={importSong}
        rhythms={fields.rhythms}
        bpm={bpm}
        player={player}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-notes">{t('notes')}</Label>
        <Textarea
          id="song-notes"
          maxLength={MAX_NOTES}
          placeholder={t('notesPlaceholder')}
          value={fields.notes}
          onChange={(event) => update({ notes: event.target.value })}
        />
      </div>
    </div>
  );
}
