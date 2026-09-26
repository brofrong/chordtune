'use client';

import {
  type AnalyzerSettings,
  DEFAULT_A4_HZ,
  findTuning,
  getInstrument,
  INSTRUMENTS,
  type InstrumentId,
  type Tuning,
} from '@chordtune/audio';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'chordtune.tuner.settings';

export const A4_MIN = 430;
export const A4_MAX = 450;

export type TunerSettings = {
  instrument: InstrumentId;
  tuningId: string;
  a4: number;
  debug: boolean;
};

export const DEFAULT_SETTINGS: TunerSettings = {
  instrument: 'guitar',
  tuningId: 'standard',
  a4: DEFAULT_A4_HZ,
  debug: false,
};

export function resolveTuning(settings: TunerSettings): Tuning {
  return findTuning(settings.instrument, settings.tuningId);
}

export function analyzerSettings(settings: TunerSettings): AnalyzerSettings {
  const instrument = getInstrument(settings.instrument);
  return {
    a4: settings.a4,
    minHz: instrument.minHz,
    maxHz: instrument.maxHz,
    debug: settings.debug,
  };
}

function sanitize(value: unknown): TunerSettings {
  if (typeof value !== 'object' || value == null) {
    return DEFAULT_SETTINGS;
  }
  const raw = value as Partial<TunerSettings>;
  const instrument = INSTRUMENTS.some((item) => item.id === raw.instrument)
    ? (raw.instrument as InstrumentId)
    : DEFAULT_SETTINGS.instrument;
  const a4 =
    typeof raw.a4 === 'number' && raw.a4 >= A4_MIN && raw.a4 <= A4_MAX
      ? raw.a4
      : DEFAULT_SETTINGS.a4;
  return {
    instrument,
    tuningId: findTuning(instrument, String(raw.tuningId)).id,
    a4,
    debug: raw.debug === true,
  };
}

/** Starts from defaults so the prerendered HTML matches, then loads the saved choice. */
export function useTunerSettings() {
  const [settings, setSettings] = useState<TunerSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSettings(sanitize(JSON.parse(saved)));
      }
    } catch {
      // ignore unreadable storage
    }
  }, []);

  const update = useCallback((patch: Partial<TunerSettings>) => {
    setSettings((current) => {
      const next = sanitize({ ...current, ...patch });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage can be unavailable in private mode
      }
      return next;
    });
  }, []);

  return [settings, update] as const;
}
