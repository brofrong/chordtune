'use client';

import { chordList, parse, type SongDoc } from '@chordtune/chord-sheet';
import { Play, Square } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useOfflineHooks } from '@/features/library/use-offline-hooks';
import {
  DEFAULT_BPM,
  patternPlayback,
  sectionPlayback,
  songPlayback,
} from '@/features/rhythm/playback';
import { RhythmBadge } from '@/features/rhythm/rhythm-badge';
import { useStrumPlayer } from '@/features/rhythm/use-strum-player';
import { ZenMode } from '@/features/zen/zen-mode';
import type { ArrangementView } from '@/lib/trpc';
import { LineView, TabView } from './line-view';
import { SongActions } from './song-actions';
import { SongDock } from './song-dock';
import { SongHeader } from './song-header';
import { type SongActionHooks, useSongActions } from './use-song-actions';

type Active = { section: number; line: number; item: number } | null;

export function SongView({
  arrangement,
  hooks,
}: {
  arrangement: ArrangementView;
  /** Offline storage and play queue, wired in by the pages that support them. */
  hooks?: SongActionHooks;
}) {
  const t = useTranslations('song');
  const offline = useOfflineHooks();
  const actions = useSongActions(arrangement, hooks ?? offline);
  const doc = useMemo(() => parse(arrangement.content).doc, [arrangement.content]);
  const bpm = arrangement.tempo ?? DEFAULT_BPM;
  const player = useStrumPlayer();
  const { rhythms } = arrangement;

  const [zenOpen, setZenOpen] = useState(false);

  const playing = useMemo(() => {
    if (player.playing === 'song') {
      return songPlayback(doc, rhythms, bpm);
    }
    const match = player.playing?.match(/^section:(\d+)$/);
    return match ? sectionPlayback(doc, rhythms, Number(match[1]), bpm) : null;
  }, [player.playing, doc, rhythms, bpm]);

  let active: Active = null;
  if (playing) {
    const index = playing.seconds.findIndex(
      (span) => player.position >= span.start && player.position < span.end,
    );
    const event = playing.events[index];
    active = event ? { section: event.section, line: event.line, item: event.item } : null;
  }

  const firstRhythm = rhythms[0];
  const rhythmHint = firstRhythm ? `${firstRhythm.name} ${firstRhythm.key}` : t('noRhythm');
  const listenHint =
    player.playing === 'song' && active
      ? (doc.sections[active.section]?.label ?? rhythmHint)
      : `${rhythmHint} · ${bpm} BPM`;
  const canPlay = useMemo(() => chordList(doc).length > 0, [doc]);

  const playSection = (section: number) => {
    const { notes } = sectionPlayback(doc, rhythms, section, bpm);
    player.toggle(`section:${section}`, notes);
  };

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-28">
      <SongHeader arrangement={arrangement} />
      <header className="-mt-2 flex flex-col gap-1">
        <p className="text-muted-foreground">{arrangement.artist.name}</p>
        <h1 className="font-bold font-display text-3xl tracking-tight">{arrangement.song.title}</h1>
        <div className="mt-2">
          <SongActions actions={actions} />
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 text-muted-foreground text-sm">
          {arrangement.capo ? <span>{t('capo', { fret: arrangement.capo })}</span> : null}
          {arrangement.tempo ? <span>{t('bpm', { bpm: arrangement.tempo })}</span> : null}
          {arrangement.key ? <span>{t('key', { key: arrangement.key })}</span> : null}
          <span>{t('by', { name: arrangement.author.name })}</span>
        </p>
      </header>

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
                    const { notes, loopSec } = patternPlayback(rhythm, firstChord(doc), bpm);
                    player.toggle(id, notes, { loopSec });
                  }}
                />
              </div>
            );
          })}
        </section>
      )}

      <div className="flex flex-col gap-5">
        {doc.sections.map((section, sectionIndex) => (
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
                <PlayButton
                  playing={player.playing === `section:${sectionIndex}`}
                  label={t('playSection')}
                  onClick={() => playSection(sectionIndex)}
                />
              </div>
            )}
            {section.lines.map((line, lineIndex) =>
              line.type === 'tab' ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                <TabView key={lineIndex} lines={line.lines} />
              ) : (
                <LineView
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  key={lineIndex}
                  items={line.items}
                  activeItem={
                    active?.section === sectionIndex && active.line === lineIndex
                      ? active.item
                      : null
                  }
                />
              ),
            )}
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
        listening={player.playing === 'song'}
        listenHint={listenHint}
        onListen={() => player.toggle('song', songPlayback(doc, rhythms, bpm).notes)}
        canPlay={canPlay}
        onPlay={() => {
          player.stop();
          setZenOpen(true);
        }}
      />
      <AnimatePresence>
        {zenOpen && (
          <ZenMode
            doc={doc}
            rhythms={rhythms}
            initialBpm={bpm}
            title={arrangement.song.title}
            artist={arrangement.artist.name}
            played={actions.me.played}
            onFinished={() => void actions.addPlayed(1)}
            onClose={() => setZenOpen(false)}
          />
        )}
      </AnimatePresence>
    </article>
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
