import { isRhythm, type Rhythm } from '@chordtune/chord-sheet';

export type Draft = {
  artist: string;
  title: string;
  capo: number | null;
  tempo: number | null;
  key: string;
  notes: string;
  /** Song source in the internal `${Chord}` format. */
  content: string;
  rhythms: Rhythm[];
};

const DRAFT_KEY = 'chordtune.draft.new';

export const EMPTY_DRAFT: Draft = {
  artist: '',
  title: '',
  capo: null,
  tempo: null,
  key: '',
  notes: '',
  content: '',
  rhythms: [],
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const numberOrNull = (value: unknown) => (typeof value === 'number' ? value : null);

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
      tempo: numberOrNull(data.tempo),
      key: text(data.key),
      notes: text(data.notes),
      content: text(data.content),
      rhythms: Array.isArray(data.rhythms) ? data.rhythms.filter(isRhythm) : [],
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
