import type { Item } from '@chordtune/chord-sheet';
import type * as React from 'react';

import { cn } from '@/lib/utils';
import { MarkChip } from './mark-chip';

type Segment = { marks: { item: Exclude<Item, { type: 'text' }>; index: number }[]; text: string };

/** Groups a line into «marks + the text after them», so lines wrap between segments. */
function segments(items: readonly Item[]): Segment[] {
  const result: Segment[] = [];
  let current: Segment = { marks: [], text: '' };
  items.forEach((item, index) => {
    if (item.type === 'text') {
      current.text += item.text;
      return;
    }
    if (current.text) {
      result.push(current);
      current = { marks: [], text: '' };
    }
    current.marks.push({ item, index });
  });
  if (current.text || current.marks.length > 0) {
    result.push(current);
  }
  return result;
}

/** Read-only line with chords above the syllables they belong to, or dots under them. */
export function LineView({
  items,
  activeItem,
  onChord,
  marks = 'chips',
}: {
  items: readonly Item[];
  /** Index of the item being played, to highlight its chord. */
  activeItem?: number | null;
  /** A tap on a chord; `item` is its index in `items`. */
  onChord?: (chord: string, anchor: HTMLElement, item: number) => void;
  /** `dots`: the zen strip view — chords become dots under the words, other marks are hidden. */
  marks?: 'chips' | 'dots';
}) {
  const dots = marks === 'dots';
  const shown = (item: Item) => item.type !== 'text' && (!dots || item.type === 'chord');
  const hasMarks = items.some(shown);
  if (!hasMarks) {
    const text = items.map((item) => (item.type === 'text' ? item.text : '')).join('');
    return <p className="min-h-6 whitespace-pre-wrap leading-6">{text}</p>;
  }
  const hasText = items.some((item) => item.type === 'text' && item.text.trim());
  const tap = (chord: string, index: number) => (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    onChord?.(chord, event.currentTarget, index);
  };

  return (
    <div className="flex flex-wrap items-end">
      {segments(items).map((segment, index) => {
        const words = hasText && (
          <span className={cn('whitespace-pre-wrap leading-6', !segment.text && 'min-w-2')}>
            {segment.text.trim() ? segment.text : segment.text.replace(/ /g, ' ')}
          </span>
        );
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity besides order
            key={index}
            className="inline-flex flex-col"
          >
            {dots ? (
              <>
                {words}
                <span className="flex h-3 items-start gap-1.5 pl-0.5">
                  {segment.marks.flatMap(({ item, index: itemIndex }) => {
                    if (item.type !== 'chord') {
                      return [];
                    }
                    const dot = (
                      // biome-ignore lint/correctness/useJsxKeyInIterable: the button/span branches below carry the key
                      <span
                        className={cn(
                          'block size-1.5 rounded-full bg-chord/45 transition-all',
                          activeItem === itemIndex && 'size-2.5 bg-chord shadow-glow',
                        )}
                      />
                    );
                    return onChord ? (
                      <button
                        key={itemIndex}
                        type="button"
                        aria-label={item.chord}
                        // The padding makes an 18px button; the pseudo-element widens what a
                        // finger can hit to 26px without moving the dot or the words.
                        className="-m-1.5 relative p-1.5 before:absolute before:-inset-1 before:content-['']"
                        onClick={tap(item.chord, itemIndex)}
                      >
                        {dot}
                      </button>
                    ) : (
                      <span key={itemIndex}>{dot}</span>
                    );
                  })}
                </span>
              </>
            ) : (
              <>
                <span className="flex min-h-5 items-end gap-0.5 pr-1">
                  {segment.marks.map(({ item, index: itemIndex }) => (
                    <MarkChip
                      key={itemIndex}
                      item={item}
                      active={activeItem === itemIndex}
                      onClick={
                        item.type === 'chord' && onChord ? tap(item.chord, itemIndex) : undefined
                      }
                    />
                  ))}
                </span>
                {words}
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function TabView({ lines }: { lines: string[] }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs leading-5">
      {lines.join('\n')}
    </pre>
  );
}
