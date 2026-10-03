'use client';

import { type Item, isChord } from '@chordtune/chord-sheet';
import { Guitar, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { rhythmColor } from '@/features/rhythm/rhythm-colors';
import { cn } from '@/lib/utils';

type MarkItem = Exclude<Item, { type: 'text' }>;

const REPEATS = [2, 3, 4];

/** Picks what to put at a letter: a chord of the song, a new chord, a bar, a rhythm marker. */
export function ChordPalette({
  anchor,
  chords,
  rhythmKeys,
  current,
  onPick,
  onRemove,
  onClose,
  onVoicing,
}: {
  anchor: HTMLElement | null;
  chords: string[];
  rhythmKeys: string[];
  /** The mark being edited, or null when adding. */
  current: MarkItem | null;
  onPick: (item: MarkItem) => void;
  onRemove: () => void;
  onClose: () => void;
  onVoicing?: (chord: string) => void;
}) {
  const t = useTranslations('editor.palette');
  const [value, setValue] = useState(current?.type === 'chord' ? current.chord : '');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const chord = value.trim();
    if (!isChord(chord)) {
      setInvalid(true);
      return;
    }
    onPick({ type: 'chord', chord });
  };

  return (
    <Popover open={anchor !== null} onOpenChange={(open) => !open && onClose()}>
      <PopoverContent anchor={anchor} align="start" className="w-72">
        {chords.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{t('chords')}</span>
            <div className="flex flex-wrap gap-1">
              {chords.map((chord) => (
                <Button
                  key={chord}
                  size="sm"
                  variant={
                    current?.type === 'chord' && current.chord === chord ? 'default' : 'outline'
                  }
                  onClick={() => onPick({ type: 'chord', chord })}
                >
                  {chord}
                </Button>
              ))}
            </div>
          </div>
        )}
        <form
          className="flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            autoFocus
            value={value}
            aria-invalid={invalid}
            placeholder={t('input')}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }}
          />
          <Button type="submit" size="sm" className="h-8">
            {t('add')}
          </Button>
        </form>
        {invalid && <p className="text-destructive text-xs">{t('invalid')}</p>}
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => onPick({ type: 'bar' })}>
            | {t('bar')}
          </Button>
          {REPEATS.map((times) => (
            <Button
              key={times}
              size="sm"
              variant="outline"
              aria-label={`${t('repeat')} ×${times}`}
              onClick={() => onPick({ type: 'repeat', times })}
            >
              ×{times}
            </Button>
          ))}
        </div>
        {rhythmKeys.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground text-xs">{t('rhythm')}</span>
            {rhythmKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onPick({ type: 'rhythm', key })}
                className={cn(
                  'rounded px-2 py-0.5 font-mono font-semibold text-xs ring-1',
                  rhythmColor(key),
                )}
              >
                @{key}
              </button>
            ))}
          </div>
        )}
        {current?.type === 'chord' && onVoicing && (
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => onVoicing(current.chord)}
          >
            <Guitar />
            {t('voicing')}
          </Button>
        )}
        {current && (
          <Button
            size="sm"
            variant="ghost"
            className="justify-start text-destructive"
            onClick={onRemove}
          >
            <Trash2 />
            {t('remove')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
