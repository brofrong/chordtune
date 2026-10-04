'use client';

import { capoHints } from '@chordtune/audio';
import {
  chordKey,
  chordList,
  chordSpellings,
  countUnreachable,
  parse,
  type Shape,
  type SongDoc,
  timeline,
  withCapo,
  type ZenModeId,
} from '@chordtune/chord-sheet';
import { Play, Square } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { ChordCard } from '@/features/chords/chord-card';
import { ChordSidebar, ChordStrip, useChordBrowser } from '@/features/chords/chord-panel';
import { useChordPanelOpen } from '@/features/chords/use-chord-panel';
import { useOfflineHooks } from '@/features/library/use-offline-hooks';
import {
  DEFAULT_BPM,
  type PlayingAt,
  patternPlayback,
  playingAt,
  sectionPlayback,
  shapePlayback,
  songPlayback,
  songSound,
} from '@/features/rhythm/playback';
import { RhythmBadge } from '@/features/rhythm/rhythm-badge';
import { useStrumPlayer } from '@/features/rhythm/use-strum-player';
import { TabStaff } from '@/features/tab/tab-staff';
import { ZenMode } from '@/features/zen/zen-mode';
import { resolveZenMode } from '@/features/zen/zen-view';
import type { ArrangementView } from '@/lib/trpc';
import { CapoPicker } from './capo-picker';
import { LineView, TabView } from './line-view';
import { SongActions } from './song-actions';
import { SongDock } from './song-dock';
import { SongHeader } from './song-header';
import { useSongSettings } from './song-settings';
import { formatSpeed } from './speed-chips';
import { type SongActionHooks, useSongActions } from './use-song-actions';

export function SongView({
  arrangement,
  hooks,
  preview = false,
}: {
  arrangement: ArrangementView;
  /** Shown inside the editor: no header, actions or counting; the dock sits above the editor's. */
  preview?: boolean;
  /** Offline storage and play queue, wired in by the pages that support them. */
  hooks?: SongActionHooks;
}) {
  const t = useTranslations('song');
  const tTuner = useTranslations('tuner');
  const offline = useOfflineHooks();
  const actions = useSongActions(
    arrangement,
    preview ? { preview: true, online: false } : (hooks ?? offline),
  );
  const doc = useMemo(() => parse(arrangement.content).doc, [arrangement.content]);
  const bpm = arrangement.tempo ?? DEFAULT_BPM;
  const [speed, setSpeed] = useState(1);
  const sound = useMemo(() => songSound(arrangement), [arrangement]);
  const player = useStrumPlayer();
  const { rhythms } = arrangement;

  const [settings, updateSettings] = useSongSettings(arrangement.id);
  const authorCapo = arrangement.capo ?? 0;
  const capo = preview ? authorCapo : (settings.capo ?? authorCapo);
  const view = useMemo(
    () => withCapo(doc, sound.tuning.strings, authorCapo, capo).doc,
    [doc, sound.tuning.strings, authorCapo, capo],
  );
  // The author's shapes only fit their own capo.
  const viewSound = useMemo(
    () => ({ ...sound, capo, voicings: capo === authorCapo ? sound.voicings : {} }),
    [sound, capo, authorCapo],
  );
  const options = { bpm, speed, ...viewSound };

  const chords = useMemo(() => chordList(view), [view]);
  const spellings = useMemo(() => chordSpellings(view), [view]);
  const browser = useChordBrowser(chords, viewSound, spellings);
  const [panelOpen, setPanelOpen] = useChordPanelOpen();
  const [peek, setPeek] = useState<{ chord: string; anchor: HTMLElement } | null>(null);
  // An edit in the editor's live preview can remount the tapped chord and leave `peek.anchor`
  // pointing at a detached node: close the popover the moment `view` changes, before that frame
  // paints (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [peekDoc, setPeekDoc] = useState(view);
  if (peekDoc !== view) {
    setPeekDoc(view);
    setPeek(null);
  }
  const playShape = (shape: Shape) => void player.play('shape', shapePlayback(shape, viewSound));
  const onChord = (raw: string, anchor: HTMLElement) => {
    const chord = chordKey(raw);
    if (chord) {
      setPeek({ chord, anchor });
    }
  };

  const [zenOpen, setZenOpen] = useState(false);
  // The editor preview never reads or writes the listener's saved settings (they are keyed by the
  // arrangement, and every unsaved song shares one key): its view toggle lives only while zen is
  // open, so the «Zen по умолчанию» field is what each preview starts from.
  const [previewZenMode, setPreviewZenMode] = useState<ZenModeId | null>(null);

  const playing = useMemo(() => {
    const opts = { bpm, speed, ...viewSound };
    if (player.playing === 'song') {
      return songPlayback(view, rhythms, opts);
    }
    const match = player.playing?.match(/^section:(\d+)$/);
    return match ? sectionPlayback(view, rhythms, Number(match[1]), opts) : null;
  }, [player.playing, view, rhythms, bpm, viewSound, speed]);

  const active: PlayingAt | null = playing ? playingAt(playing, player.position) : null;

  const changeSpeed = (next: number) => {
    // Scheduled notes are fixed at their speed: stop instead of drifting.
    player.stop();
    setSpeed(next);
  };

  const firstRhythm = rhythms[0];
  const rhythmHint = firstRhythm ? `${firstRhythm.name} ${firstRhythm.key}` : t('noRhythm');
  const speedHint = speed === 1 ? '' : ` · ${formatSpeed(speed)}`;
  const listenHint =
    player.playing === 'song' && active
      ? (view.sections[active.section]?.label ?? rhythmHint)
      : `${rhythmHint} · ${bpm} BPM${speedHint}`;
  const canPlay = useMemo(() => timeline(view, rhythms).length > 0, [view, rhythms]);
  const zenMode = resolveZenMode(
    preview ? previewZenMode : settings.zenMode,
    arrangement.zenMode,
    view,
  );

  const playSection = (section: number) => {
    const { notes } = sectionPlayback(view, rhythms, section, options);
    player.toggle(`section:${section}`, notes);
  };

  const article = (
    <article
      className={
        // The dock grew a speed-chips row (1.75rem) plus its gap (0.5rem): bottom padding is
        // raised by that much so the last content still clears it, above the mobile tab bar.
        preview
          ? 'flex w-full flex-col gap-6 pb-[8.25rem]'
          : 'flex w-full min-w-0 max-w-2xl flex-1 flex-col gap-6 px-4 pt-4 pb-[9.25rem]'
      }
    >
      {!preview && <SongHeader arrangement={arrangement} />}
      <header className="-mt-2 flex flex-col gap-1">
        <p className="text-muted-foreground">{arrangement.artist.name}</p>
        <h1 className="font-bold font-display text-3xl tracking-tight">{arrangement.song.title}</h1>
        {!preview && (
          <div className="mt-2">
            <SongActions actions={actions} />
          </div>
        )}
        <p className="mt-2 flex flex-wrap gap-x-4 text-muted-foreground text-sm">
          {sound.tuning.id !== 'standard' ? (
            <span>{t('tuning', { name: tTuner(`tunings.guitar.${sound.tuning.id}`) })}</span>
          ) : null}
          {preview ? (
            arrangement.capo ? (
              <span>{t('capo', { fret: arrangement.capo })}</span>
            ) : null
          ) : (
            <CapoPicker
              value={capo}
              authorCapo={authorCapo}
              followsAuthor={settings.capo === null}
              hints={() => capoHints(doc, sound.tuning.strings, authorCapo)}
              onChange={(next) => {
                player.stop();
                updateSettings({ capo: next });
              }}
            />
          )}
          {arrangement.tempo ? <span>{t('bpm', { bpm: arrangement.tempo })}</span> : null}
          {arrangement.key ? <span>{t('key', { key: arrangement.key })}</span> : null}
          <span>{t('by', { name: arrangement.author.name })}</span>
        </p>
      </header>

      <ChordStrip
        browser={browser}
        onPlay={playShape}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        className={preview ? undefined : 'lg:hidden'}
      />

      {rhythms.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-muted-foreground text-xs uppercase tracking-wide">{t('rhythm')}</h2>
          {rhythms.map((rhythm) => {
            const id = `rhythm:${rhythm.key}`;
            return (
              <div key={rhythm.key} className="flex items-center gap-2">
                <RhythmBadge rhythmKey={rhythm.key} rhythm={rhythm} showPattern />
                <PlayButton
                  playing={player.playing === id}
                  label={t('play')}
                  onClick={() => {
                    const { notes, loopSec } = patternPlayback(rhythm, firstChord(view), options);
                    player.toggle(id, notes, { loopSec });
                  }}
                />
              </div>
            );
          })}
        </section>
      )}

      <div className="flex flex-col gap-5">
        {view.sections.map((section, sectionIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: sections are positional
          <section key={sectionIndex} className="flex flex-col gap-1">
            {section.label !== null && (
              <div className="flex items-center gap-2">
                <h2 className="font-medium text-muted-foreground">{section.label}</h2>
                {section.rhythm && (
                  <RhythmBadge
                    rhythmKey={section.rhythm}
                    rhythm={rhythms.find((r) => r.key === section.rhythm)}
                  />
                )}
                {section.tempo && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {t('bpm', { bpm: section.tempo })}
                  </span>
                )}
                <PlayButton
                  playing={player.playing === `section:${sectionIndex}`}
                  label={t('playSection')}
                  onClick={() => playSection(sectionIndex)}
                />
              </div>
            )}
            {section.lines.map((line, lineIndex) => {
              const here = active?.section === sectionIndex && active.line === lineIndex;
              if (line.type === 'tab') {
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  <div key={lineIndex} className="flex flex-col gap-1">
                    {capo !== authorCapo && (
                      <p className="text-muted-foreground text-xs">
                        {t('asciiTabCapo', { fret: authorCapo })}
                      </p>
                    )}
                    <TabView lines={line.lines} />
                  </div>
                );
              }
              if (line.type === 'alphatex') {
                const lost = countUnreachable(line.block);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  <div key={lineIndex} className="flex flex-col gap-1">
                    {lost > 0 && (
                      <p className="rounded-md bg-destructive/10 px-2 py-1 text-destructive text-xs">
                        {t('unreachable', { count: lost, fret: capo })}
                      </p>
                    )}
                    <TabStaff
                      block={line.block}
                      activeBeat={here ? active.beat : null}
                      className="py-1"
                    />
                  </div>
                );
              }
              return (
                <LineView
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  key={lineIndex}
                  items={line.items}
                  activeItem={here ? active.item : null}
                  onChord={onChord}
                />
              );
            })}
          </section>
        ))}
      </div>

      {arrangement.notes && (
        <section className="flex flex-col gap-1">
          <h2 className="text-muted-foreground text-xs uppercase tracking-wide">{t('notes')}</h2>
          <p className="whitespace-pre-wrap text-muted-foreground text-sm">{arrangement.notes}</p>
        </section>
      )}
      <SongDock
        raised={preview}
        listening={player.playing === 'song'}
        listenHint={listenHint}
        onListen={() => player.toggle('song', songPlayback(view, rhythms, options).notes)}
        speed={speed}
        onSpeedChange={changeSpeed}
        canPlay={canPlay}
        onPlay={() => {
          player.stop();
          setPreviewZenMode(null);
          setZenOpen(true);
        }}
      />
      <AnimatePresence>
        {zenOpen && (
          <ZenMode
            doc={view}
            rhythms={rhythms}
            bpm={bpm}
            speed={speed}
            onSpeedChange={setSpeed}
            mode={zenMode}
            onModeChange={(next) =>
              preview ? setPreviewZenMode(next) : updateSettings({ zenMode: next })
            }
            sound={viewSound}
            capoControl={
              // The preview pins the author's capo, like the page header above. The list opens
              // above zen (z-[60]) and below the toast (z-[70]).
              preview ? undefined : (
                <CapoPicker
                  value={capo}
                  authorCapo={authorCapo}
                  followsAuthor={settings.capo === null}
                  hints={() => capoHints(doc, sound.tuning.strings, authorCapo)}
                  onChange={(next) => updateSettings({ capo: next })}
                  layerClassName="z-[65]"
                />
              )
            }
            title={arrangement.song.title}
            artist={arrangement.artist.name}
            played={actions.me.played}
            onFinished={() => void actions.addPlayed(1)}
            onClose={() => setZenOpen(false)}
          />
        )}
      </AnimatePresence>
      <Popover open={peek !== null} onOpenChange={(open) => !open && setPeek(null)}>
        <PopoverContent anchor={peek?.anchor ?? null} className="w-auto p-1.5">
          {peek && <ChordCard chord={peek.chord} browser={browser} onPlay={playShape} />}
        </PopoverContent>
      </Popover>
    </article>
  );

  if (preview) {
    return article;
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl justify-center gap-6 lg:max-w-5xl">
      {article}
      <ChordSidebar
        browser={browser}
        onPlay={playShape}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}

function firstChord(doc: SongDoc): string {
  for (const section of doc.sections) {
    for (const line of section.lines) {
      if (line.type === 'line') {
        const chord = line.items.find((item) => item.type === 'chord');
        if (chord?.type === 'chord') {
          return chord.chord;
        }
      }
    }
  }
  return 'Am';
}

export function PlayButton({
  playing,
  label,
  onClick,
}: {
  playing: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={playing}
      onClick={onClick}
    >
      {playing ? <Square /> : <Play />}
    </Button>
  );
}
