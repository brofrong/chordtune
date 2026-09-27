'use client';

import {
  chordList,
  type Item,
  joinLine,
  type Mark,
  type Rhythm,
  type SongDoc,
  splitLine,
} from '@chordtune/chord-sheet';
import { Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlayingAt } from '@/features/rhythm/playback';
import { TabView } from '@/features/song/line-view';
import { MarkChip } from '@/features/song/mark-chip';
import { cn } from '@/lib/utils';
import { ChordPalette } from './chord-palette';
import {
  addSection,
  insertLine,
  removeLine,
  removeSection,
  setLineItems,
  updateSection,
} from './doc-edit';

export type ActiveChord = PlayingAt | null;

type Target = {
  section: number;
  line: number;
  pos: number;
  /** Index into the line's marks when editing one. */
  mark: number | null;
  anchor: HTMLElement;
};

const NO_RHYTHM = '-';
const DRAG_THRESHOLD_PX = 6;

export function VisualEditor({
  doc,
  onChange,
  rhythms,
  active,
  playingSection,
  onPlaySection,
}: {
  doc: SongDoc;
  onChange: (doc: SongDoc) => void;
  rhythms: Rhythm[];
  active: ActiveChord;
  playingSection: number | null;
  onPlaySection: (section: number) => void;
}) {
  const t = useTranslations('editor');
  const [target, setTarget] = useState<Target | null>(null);
  const [editingLine, setEditingLine] = useState<{ section: number; line: number } | null>(null);
  const chords = useMemo(() => chordList(doc), [doc]);
  const rhythmKeys = rhythms.map((rhythm) => rhythm.key);

  const lineItems = (section: number, line: number): Item[] => {
    const found = doc.sections[section]?.lines[line];
    return found?.type === 'line' ? found.items : [];
  };

  const editMarks = (
    section: number,
    line: number,
    edit: (text: string, marks: Mark[]) => Mark[],
  ) => {
    const { text, marks } = splitLine(lineItems(section, line));
    onChange(setLineItems(doc, section, line, joinLine(text, edit(text, marks))));
  };

  const currentMark = (() => {
    if (!target || target.mark === null) {
      return null;
    }
    return splitLine(lineItems(target.section, target.line)).marks[target.mark]?.item ?? null;
  })();

  const rhythmItems = [
    { value: NO_RHYTHM, label: t('noRhythm') },
    ...rhythmKeys.map((key) => ({ value: key, label: `@${key}` })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-xs">{t('visualHint')}</p>
      {doc.sections.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('emptyVisual')}</p>
      )}
      {doc.sections.map((section, sectionIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sections are positional
        <section key={sectionIndex} className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <Input
              value={section.label ?? ''}
              placeholder={t('sectionLabel')}
              aria-label={t('sectionLabel')}
              className="h-8 max-w-48 border-transparent bg-transparent px-1 font-medium dark:bg-transparent"
              onChange={(event) =>
                onChange(updateSection(doc, sectionIndex, { label: event.target.value || null }))
              }
            />
            {section.label !== null && (
              <Select
                value={section.rhythm ?? NO_RHYTHM}
                items={rhythmItems}
                onValueChange={(value) =>
                  onChange(
                    updateSection(doc, sectionIndex, {
                      rhythm: value && value !== NO_RHYTHM ? value : null,
                    }),
                  )
                }
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rhythmItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('playSection')}
              onClick={() => onPlaySection(sectionIndex)}
            >
              {playingSection === sectionIndex ? <Square /> : <Play />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground"
              aria-label={t('removeSection')}
              onClick={() => onChange(removeSection(doc, sectionIndex))}
            >
              <Trash2 />
            </Button>
          </div>

          {section.lines.map((line, lineIndex) => {
            const key = `${sectionIndex}:${lineIndex}`;
            if (line.type === 'tab') {
              return <TabView key={key} lines={line.lines} />;
            }
            if (line.type === 'alphatex') {
              // TODO(task 9): render the alphaTex block.
              return null;
            }
            const editing = editingLine?.section === sectionIndex && editingLine.line === lineIndex;
            return (
              <div key={key} className="group flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <LineTextInput
                      initial={splitLine(line.items).text}
                      placeholder={t('lineTextPlaceholder')}
                      onDone={(text) => {
                        const { marks } = splitLine(line.items);
                        onChange(setLineItems(doc, sectionIndex, lineIndex, joinLine(text, marks)));
                        setEditingLine(null);
                      }}
                    />
                  ) : (
                    <LineEditor
                      lineKey={key}
                      items={line.items}
                      activeItem={
                        active?.section === sectionIndex && active.line === lineIndex
                          ? active.item
                          : null
                      }
                      onTap={(pos, mark, anchor) =>
                        setTarget({ section: sectionIndex, line: lineIndex, pos, mark, anchor })
                      }
                      onMove={(mark, pos) =>
                        editMarks(sectionIndex, lineIndex, (_, marks) =>
                          marks.map((m, i) => (i === mark ? { ...m, pos } : m)),
                        )
                      }
                    />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={t('editLine')}
                  onClick={() => setEditingLine({ section: sectionIndex, line: lineIndex })}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={t('removeLine')}
                  onClick={() => onChange(removeLine(doc, sectionIndex, lineIndex))}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}

          <Button
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground"
            onClick={() => {
              const at = section.lines.length;
              onChange(insertLine(doc, sectionIndex, at, { type: 'line', items: [] }));
              setEditingLine({ section: sectionIndex, line: at });
            }}
          >
            <Plus />
            {t('addLine')}
          </Button>
        </section>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange(addSection(doc, t('defaultSection')))}
      >
        <Plus />
        {t('addSection')}
      </Button>

      <ChordPalette
        key={target ? `${target.section}:${target.line}:${target.pos}:${target.mark}` : 'closed'}
        anchor={target?.anchor ?? null}
        chords={chords}
        rhythmKeys={rhythmKeys}
        current={currentMark}
        onClose={() => setTarget(null)}
        onPick={(item) => {
          if (target) {
            editMarks(target.section, target.line, (_, marks) =>
              target.mark === null
                ? [...marks, { pos: target.pos, item }]
                : marks.map((m, i) => (i === target.mark ? { ...m, item } : m)),
            );
          }
          setTarget(null);
        }}
        onRemove={() => {
          if (target && target.mark !== null) {
            editMarks(target.section, target.line, (_, marks) =>
              marks.filter((_, i) => i !== target.mark),
            );
          }
          setTarget(null);
        }}
      />
    </div>
  );
}

function LineTextInput({
  initial,
  placeholder,
  onDone,
}: {
  initial: string;
  placeholder: string;
  onDone: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <Input
      autoFocus
      value={text}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => onDone(text)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onDone(text);
        }
      }}
    />
  );
}

/**
 * A line as tappable letters with its marks above them. Tapping a letter adds a mark there,
 * tapping a mark edits it, dragging a mark onto another letter moves it.
 */
function LineEditor({
  lineKey,
  items,
  activeItem,
  onTap,
  onMove,
}: {
  lineKey: string;
  items: Item[];
  activeItem: number | null;
  onTap: (pos: number, mark: number | null, anchor: HTMLElement) => void;
  onMove: (mark: number, pos: number) => void;
}) {
  const { text, marks } = splitLine(items);
  // Item index of each mark, to match the playback highlight.
  const markItems = items.flatMap((item, index) => (item.type === 'text' ? [] : [index]));
  const [drag, setDrag] = useState<{ mark: number; over: number | null } | null>(null);
  const dragStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const positionAt = (x: number, y: number): number | null => {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-pos]');
    return cell?.dataset.line === lineKey ? Number(cell.dataset.pos) : null;
  };

  const positions = Array.from({ length: text.length + 1 }, (_, pos) => pos);

  return (
    <div className="flex flex-wrap items-end">
      {positions.map((pos) => {
        const char = text[pos];
        const here = marks.flatMap((mark, index) => (mark.pos === pos ? [index] : []));
        return (
          <span
            key={pos}
            data-pos={pos}
            data-line={lineKey}
            className={cn('inline-flex flex-col rounded-sm', drag?.over === pos && 'bg-primary/15')}
          >
            <span className="flex min-h-5 items-end gap-0.5">
              {here.map((index) => {
                const mark = marks[index];
                if (!mark) {
                  return null;
                }
                return (
                  <button
                    key={index}
                    type="button"
                    className={cn(
                      'touch-none select-none rounded outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      drag?.mark === index && 'opacity-40',
                    )}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragStart.current = { x: event.clientX, y: event.clientY, moved: false };
                    }}
                    onPointerMove={(event) => {
                      const start = dragStart.current;
                      if (!start) {
                        return;
                      }
                      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
                      if (start.moved || distance > DRAG_THRESHOLD_PX) {
                        start.moved = true;
                        setDrag({ mark: index, over: positionAt(event.clientX, event.clientY) });
                      }
                    }}
                    onPointerUp={(event) => {
                      const start = dragStart.current;
                      dragStart.current = null;
                      if (start?.moved) {
                        suppressClick.current = true;
                        const over = positionAt(event.clientX, event.clientY);
                        if (over !== null && over !== pos) {
                          onMove(index, over);
                        }
                      }
                      setDrag(null);
                    }}
                    onPointerCancel={() => {
                      dragStart.current = null;
                      setDrag(null);
                    }}
                    onClick={(event) => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      onTap(pos, index, event.currentTarget);
                    }}
                  >
                    <MarkChip item={mark.item} active={activeItem === markItems[index]} />
                  </button>
                );
              })}
            </span>
            <button
              type="button"
              onClick={(event) => onTap(pos, null, event.currentTarget)}
              className={cn(
                'whitespace-pre rounded-sm leading-6 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                char === undefined && 'min-w-4 text-muted-foreground/50',
              )}
            >
              {char === undefined ? '+' : char === ' ' ? ' ' : char}
            </button>
          </span>
        );
      })}
    </div>
  );
}
