import {
  isRhythm,
  isSongTuningId,
  isZenMode,
  type Rhythm,
  type SongTuningId,
  sanitizeVoicings,
  type Voicings,
  type ZenModeId,
} from '@chordtune/chord-sheet';

import type { DeezerPick } from './artist-field';

export type Draft = {
  artist: string;
  title: string;
  capo: number | null;
  tuning: SongTuningId;
  voicings: Voicings;
  zenMode: ZenModeId | null;
  tempo: number | null;
  key: string;
  notes: string;
  /** Song source in the internal `${Chord}` format. */
  content: string;
  rhythms: Rhythm[];
  /** The Deezer artist picked in the editor, if any; kept so a sign-in redirect does not lose it. */
  deezerPick: DeezerPick | null;
};

const DRAFT_KEY = 'chordtune.draft.new';

export const EMPTY_DRAFT: Draft = {
  artist: '',
  title: '',
  capo: null,
  tuning: 'standard',
  voicings: {},
  zenMode: null,
  tempo: null,
  key: '',
  notes: '',
  content: '',
  rhythms: [],
  deezerPick: null,
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null);

function deezerPick(value: unknown): DeezerPick | null {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).deezerId === 'number' &&
    typeof (value as Record<string, unknown>).name === 'string'
  ) {
    const { deezerId, name } = value as { deezerId: number; name: string };
    return { deezerId, name };
  }
  return null;
}

/** The unsaved «new song» form; anything malformed falls back to empty fields. */
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      artist: text(data.artist),
      title: text(data.title),
      capo: numberOrNull(data.capo),
      tuning: isSongTuningId(data.tuning) ? data.tuning : 'standard',
      voicings: sanitizeVoicings(data.voicings, 6),
      zenMode: isZenMode(data.zenMode) ? data.zenMode : null,
      tempo: numberOrNull(data.tempo),
      key: text(data.key),
      notes: text(data.notes),
      content: text(data.content),
      rhythms: Array.isArray(data.rhythms) ? data.rhythms.filter(isRhythm) : [],
      deezerPick: deezerPick(data.deezerPick),
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // storage can be unavailable in private mode
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage can be unavailable in private mode
  }
}
