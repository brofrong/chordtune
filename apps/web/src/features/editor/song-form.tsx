'use client';

import { capoHints } from '@chordtune/audio';
import {
  chordList,
  type ImportedSong,
  parse,
  type SongDoc,
  serialize,
  songTuning,
  withCapo,
} from '@chordtune/chord-sheet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { DEFAULT_BPM, songSound } from '@/features/rhythm/playback';
import { RhythmChips } from '@/features/rhythm/rhythm-chips';
import { useStrumPlayer } from '@/features/rhythm/use-strum-player';
import { songHref } from '@/features/song/links';
import { SongView } from '@/features/song/song-view';
import { useRouter } from '@/i18n/navigation';
import { type ArrangementView, useTRPC } from '@/lib/trpc';
import type { DeezerPick } from './artist-field';
import { ChordEditor, unknownRhythmKeys } from './chord-editor';
import { SaveButton, type SaveState } from './save-button';
import {
  MAX_NOTES,
  MAX_TEMPO,
  MIN_TEMPO,
  type SongFields,
  SongMetaCard,
  SongMetaSheet,
} from './song-meta';
import { clearDraft, EMPTY_DRAFT, loadDraft, saveDraft } from './use-draft';

const { content: _emptyContent, deezerPick: _emptyDeezerPick, ...EMPTY_FIELDS } = EMPTY_DRAFT;
const SAVED_PAUSE_MS = 700;

/**
 * The song editor, with the song in the middle: details fold into one card, rhythms into chips,
 * and the dock switches between visual, text and a preview. `?edit=<id>` edits an existing
 * arrangement; a new song keeps a draft in localStorage.
 */
export function SongForm() {
  const t = useTranslations('editor');
  const trpc = useTRPC();
  const router = useRouter();
  const session = useSession();
  const openAuth = useAuthSheet();
  const toast = useToast();
  const player = useStrumPlayer();
  const queryClient = useQueryClient();
  const editId = useSearchParams().get('edit');

  const [fields, setFields] = useState<SongFields>(EMPTY_FIELDS);
  const [doc, setDoc] = useState<SongDoc>(() => parse('').doc);
  const [docVersion, setDocVersion] = useState(0);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [deezerPick, setDeezerPick] = useState<DeezerPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [ready, setReady] = useState(false);
  const [pendingCapo, setPendingCapo] = useState<{
    to: number;
    result: ReturnType<typeof withCapo>;
  } | null>(null);

  const replaceDoc = (next: SongDoc) => {
    setDoc(next);
    setDocVersion((version) => version + 1);
  };

  // A new song restores its draft; an edited one loads from the server once.
  const existing = useQuery({
    ...trpc.arrangements.byId.queryOptions({ id: editId ?? '' }),
    enabled: Boolean(editId),
    // Never start editing from a cached copy: saving it would undo the last edit.
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const loaded = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fill the form once per source
  useEffect(() => {
    if (loaded.current) {
      return;
    }
    if (editId) {
      if (!existing.data || existing.isFetching) {
        return;
      }
      const song = existing.data;
      setFields({
        artist: song.artist.name,
        title: song.song.title,
        capo: song.capo,
        tuning: song.tuning,
        voicings: song.voicings,
        zenMode: song.zenMode,
        tempo: song.tempo,
        key: song.key ?? '',
        notes: song.notes,
        rhythms: song.rhythms,
      });
      replaceDoc(parse(song.content).doc);
    } else {
      const draft = loadDraft();
      if (draft) {
        const { content, deezerPick: draftDeezerPick, ...rest } = draft;
        setFields(rest);
        setDeezerPick(draftDeezerPick);
        replaceDoc(parse(content).doc);
      }
    }
    loaded.current = true;
    setReady(true);
  }, [editId, existing.data, existing.isFetching]);

  useEffect(() => {
    if (!ready || editId) {
      return;
    }
    const timer = setTimeout(
      () => saveDraft({ ...fields, deezerPick, content: serialize(doc) }),
      400,
    );
    return () => clearTimeout(timer);
  }, [fields, doc, deezerPick, ready, editId]);

  const update = (patch: Partial<SongFields>) => {
    // Tunings that share shapes (half-step-down/d-standard with standard, drop-c with drop-d)
    // keep the author's voicings; only an actual change of strings invalidates them.
    const retuned =
      patch.tuning !== undefined &&
      songTuning(patch.tuning).strings !== songTuning(fields.tuning).strings;
    if (retuned && Object.keys(fields.voicings).length > 0) {
      toast(t('voicingsReset'));
    }
    setFields((current) => ({ ...current, ...patch, ...(retuned ? { voicings: {} } : {}) }));
  };
  const chords = useMemo(() => chordList(doc), [doc]);
  const bpm = fields.tempo ?? DEFAULT_BPM;
  const sound = useMemo(() => songSound(fields), [fields]);
  const hints = useMemo(
    () => (metaOpen ? capoHints(doc, sound.tuning.strings, fields.capo ?? 0) : null),
    [metaOpen, doc, sound.tuning.strings, fields.capo],
  );

  const hasMusic = (song: SongDoc) =>
    chordList(song).length > 0 ||
    song.sections.some((section) => section.lines.some((line) => line.type === 'alphatex'));

  const pickCapo = (next: number | null) => {
    const from = fields.capo ?? 0;
    const to = next ?? 0;
    if (to === from) {
      setPendingCapo(null);
      return;
    }
    if (!hasMusic(doc)) {
      update({ capo: to || null });
      return;
    }
    setPendingCapo({ to, result: withCapo(doc, sound.tuning.strings, from, to) });
  };

  const recalculate = () => {
    if (!pendingCapo) {
      return;
    }
    replaceDoc(pendingCapo.result.doc);
    if (Object.keys(fields.voicings).length > 0) {
      toast(t('voicingsResetCapo'));
    }
    update({ capo: pendingCapo.to || null, voicings: {} });
    setPendingCapo(null);
  };

  const keepWritten = () => {
    if (pendingCapo) {
      update({ capo: pendingCapo.to || null });
    }
    setPendingCapo(null);
  };

  const onSaved = (saved: { id: string; artistSlug: string; songSlug: string }) => {
    if (!editId) {
      clearDraft();
    }
    void queryClient.invalidateQueries(trpc.arrangements.byId.queryFilter({ id: saved.id }));
    void queryClient.invalidateQueries(trpc.library.pathFilter());
    void queryClient.invalidateQueries(trpc.songs.list.queryFilter());
    setSaveState('saved');
    setTimeout(() => router.push(songHref(saved)), SAVED_PAUSE_MS);
  };
  const onFailed = (failure: { message: string }) => {
    setSaveState('idle');
    setError(t('saveFailed', { message: failure.message }));
  };
  const create = useMutation(
    trpc.arrangements.create.mutationOptions({ onSuccess: onSaved, onError: onFailed }),
  );
  const edit = useMutation(
    trpc.arrangements.update.mutationOptions({ onSuccess: onSaved, onError: onFailed }),
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
    toast(t('imported'));
  };

  const save = () => {
    setError(null);
    const artist = fields.artist.trim();
    const title = fields.title.trim();
    if (!artist || !title) {
      setError(t('required'));
      setMetaOpen(true);
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
    // Drop voicings for chords no longer in the song: otherwise they count against the
    // 64-voicing limit even though the author already removed them.
    const voicings = Object.fromEntries(
      Object.entries(fields.voicings).filter(([chord]) => chords.includes(chord)),
    );
    const input = {
      // A Deezer pick counts only while the field still holds the picked name.
      artist:
        deezerPick && deezerPick.name === artist
          ? { deezerId: deezerPick.deezerId, name: artist }
          : { name: artist },
      song: { title },
      content: serialize(doc),
      rhythms: fields.rhythms,
      capo: fields.capo || null,
      tuning: fields.tuning,
      voicings,
      zenMode: fields.zenMode,
      tempo: fields.tempo === null ? null : Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, fields.tempo)),
      key: fields.key.trim() || null,
      notes: fields.notes,
    };
    setSaveState('saving');
    if (editId) {
      edit.mutate({ ...input, id: editId });
    } else {
      create.mutate(input);
    }
  };

  const previewArrangement: ArrangementView = {
    id: editId ?? 'preview',
    content: serialize(doc),
    rhythms: fields.rhythms,
    chords,
    key: fields.key.trim() || null,
    capo: fields.capo,
    tuning: fields.tuning,
    voicings: fields.voicings,
    zenMode: fields.zenMode,
    tempo: fields.tempo,
    notes: fields.notes,
    status: 'published',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    // The preview never links to a profile, so a real username isn't needed here.
    author: {
      id: session.data?.user.id ?? '',
      name: session.data?.user.name ?? '',
      username: null,
    },
    song: {
      id: '',
      title: fields.title.trim() || t('metaPlaceholder'),
      slug: '',
      createdAt: new Date(0),
    },
    artist: {
      id: '',
      name: fields.artist.trim(),
      slug: '',
      pictureSmallUrl: null,
    },
    stats: { views: 0, likes: 0, saves: 0 },
    me: null,
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-40">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('close')}
          className="rounded-xl bg-surface"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/songs'))}
        >
          <X />
        </Button>
        <h1 className="font-semibold text-muted-foreground text-sm">
          {editId ? t('editTitle') : t('newTitle')}
        </h1>
        <div className="ml-auto">
          <SaveButton state={saveState} onClick={save} />
        </div>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}

      <SongMetaCard fields={fields} onOpen={() => setMetaOpen(true)} />
      <RhythmChips
        rhythms={fields.rhythms}
        onChange={(rhythms) => update({ rhythms })}
        chords={chords}
        bpm={bpm}
        player={player}
      />
      <ChordEditor
        key={`${editId ?? 'new'}:${ready}`}
        doc={doc}
        docVersion={docVersion}
        onDocChange={setDoc}
        onImport={importSong}
        rhythms={fields.rhythms}
        bpm={bpm}
        sound={sound}
        player={player}
        // Keyed by `previewArrangement.id`, not by doc/docVersion: it only changes with `editId`,
        // so speed survives an edit but still resets when switching to a different song.
        preview={<SongView key={previewArrangement.id} arrangement={previewArrangement} preview />}
        onVoicingsChange={(voicings) => update({ voicings })}
      />

      <SongMetaSheet
        open={metaOpen}
        onOpenChange={(open) => {
          setMetaOpen(open);
          if (!open) {
            setPendingCapo(null);
          }
        }}
        fields={fields}
        onChange={update}
        capoHints={hints}
        pendingCapo={
          pendingCapo
            ? {
                to: pendingCapo.to,
                unreachable: pendingCapo.result.unreachable,
                brokenTabs: pendingCapo.result.brokenTabs,
              }
            : null
        }
        onCapoPick={pickCapo}
        onRecalculate={recalculate}
        onKeepWritten={keepWritten}
        artistId={artistId}
        onArtistMatch={setArtistId}
        onDeezerPick={setDeezerPick}
      />
    </div>
  );
}
