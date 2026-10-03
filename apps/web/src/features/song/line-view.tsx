import type { Item } from '@chordtune/chord-sheet';

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

/** Read-only line with chords above the syllables they belong to. */
export function LineView({
  items,
  activeItem,
  onChord,
}: {
  items: readonly Item[];
  /** Index of the item being played, to highlight its chord. */
  activeItem?: number | null;
  /** Tapping a chord: its text and the element to anchor a popover to. */
  onChord?: (chord: string, anchor: HTMLElement) => void;
}) {
  const hasMarks = items.some((item) => item.type !== 'text');
  if (!hasMarks) {
    const text = items.map((item) => (item.type === 'text' ? item.text : '')).join('');
    return <p className="min-h-6 whitespace-pre-wrap leading-6">{text}</p>;
  }
  const hasText = items.some((item) => item.type === 'text' && item.text.trim());

  return (
    <div className="flex flex-wrap items-end">
      {segments(items).map((segment, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity besides order
          key={index}
          className="inline-flex flex-col"
        >
          <span className="flex min-h-5 items-end gap-0.5 pr-1">
            {segment.marks.map(({ item, index: itemIndex }) => (
              <MarkChip
                key={itemIndex}
                item={item}
                active={activeItem === itemIndex}
                onClick={
                  item.type === 'chord' && onChord
                    ? (event) => onChord(item.chord, event.currentTarget)
                    : undefined
                }
              />
            ))}
          </span>
          {hasText && (
            <span className={cn('whitespace-pre-wrap leading-6', !segment.text && 'min-w-2')}>
              {segment.text.trim() ? segment.text : segment.text.replace(/ /g, ' ')}
            </span>
          )}
        </span>
      ))}
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
