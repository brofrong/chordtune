'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useStrumPlayer } from '@/features/rhythm/use-strum-player';
import { useTunerSettings } from '@/features/tuner/settings';
import { ChordFinder } from './chord-finder';
import { ChordSearch } from './chord-search';
import { CHORD_INSTRUMENTS, chordInstrument } from './identify';
import { InstrumentPicker } from './instrument-picker';

type Mode = 'identify' | 'search';

/** The «Аккорды» tab: tell what chord the pressed notes are, or show every shape of a chord. */
export function ChordsScreen() {
  const t = useTranslations('chords');
  const [settings, update] = useTunerSettings();
  const [mode, setMode] = useState<Mode>('identify');
  const player = useStrumPlayer();
  const tuning = chordInstrument(settings.instrument, settings.tuningId);
  const instrument = CHORD_INSTRUMENTS.includes(settings.instrument)
    ? settings.instrument
    : 'guitar';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-4 pb-28">
      <h1 className="font-bold font-display text-3xl tracking-tight">{t('pageTitle')}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[mode]}
          onValueChange={(value) => {
            if (value[0] === 'identify' || value[0] === 'search') {
              player.stop();
              setMode(value[0]);
            }
          }}
        >
          <ToggleGroupItem value="identify" className="px-4">
            {t('identify')}
          </ToggleGroupItem>
          <ToggleGroupItem value="search" className="px-4">
            {t('search')}
          </ToggleGroupItem>
        </ToggleGroup>
        <InstrumentPicker
          instrument={instrument}
          tuningId={tuning.id}
          onChange={(patch) => {
            player.stop();
            update(patch);
          }}
        />
      </div>
      {mode === 'identify' ? (
        // A new tuning is a new neck: start with nothing pressed.
        <ChordFinder
          key={`${tuning.instrument}:${tuning.id}`}
          strings={tuning.strings}
          player={player}
        />
      ) : (
        <ChordSearch strings={tuning.strings} player={player} />
      )}
    </div>
  );
}
