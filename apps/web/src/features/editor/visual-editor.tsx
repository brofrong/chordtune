'use client';

import {
  alphatexLine,
  chordKey,
  chordList,
  type Item,
  isTempo,
  joinLine,
  type Mark,
  type Rhythm,
  type SongDoc,
  splitLine,
} from '@chordtune/chord-sheet';
import { Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlayingAt, SongSound } from '@/features/rhythm/playback';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { TabView } from '@/features/song/line-view';
import { MarkChip } from '@/features/song/mark-chip';
import { TabEditorSheet } from '@/features/tab/tab-editor-sheet';
import { TabStaff } from '@/features/tab/tab-staff';
import { cn } from '@/lib/utils';
import { ChordPalette } from './chord-palette';
import {
  addSection,
  insertLine,
  removeLine,
  removeSection,
  setLine,
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
  songBpm,
  sound,
  player,
  playingTab,
  onPlayTab,
  onEditVoicing,
}: {
  doc: SongDoc;
  onChange: (doc: SongDoc) => void;
  rhythms: Rhythm[];
  active: ActiveChord;
  playingSection: number | null;
  onPlaySection: (section: number) => void;
  songBpm: number;
  sound: SongSound;
  player: StrumPlayerControls;
  /** `"section:line"` of the tab block that is playing. */
  playingTab: string | null;
  onPlayTab: (section: number, line: number) => void;
  onEditVoicing: (chord: string) => void;
}) {
  const t = useTranslations('editor');
  const [target, setTarget] = useState<Target | null>(null);
  const [editingLine, setEditingLine] = useState<{ section: number; line: number } | null>(null);
  const [editingTab, setEditingTab] = useState<{ section: number; line: number } | null>(null);
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

  // `playingSection`/`playingTab` are positional ids: inserting or removing a line or a
  // section shifts every later one, so what used to match a playing id now points at a
  // different line. Stop playback first so the play/stop indicator never drifts from reality.
  const reorder = (next: SongDoc) => {
    player.stop();
    onChange(next);
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
            {section.label !== null && (
              <SectionTempo
                value={section.tempo}
                songBpm={songBpm}
                onChange={(tempo) => onChange(updateSection(doc, sectionIndex, { tempo }))}
              />
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
              onClick={() => reorder(removeSection(doc, sectionIndex))}
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
              return (
                <div key={key} className="group flex items-start gap-1">
                  <TabStaff
                    block={line.block}
                    activeBeat={
                      active?.section === sectionIndex && active.line === lineIndex
                        ? active.beat
                        : null
                    }
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={t('playTab')}
                    onClick={() => onPlayTab(sectionIndex, lineIndex)}
                  >
                    {playingTab === key ? <Square /> : <Play />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={t('editTab')}
                    onClick={() => setEditingTab({ section: sectionIndex, line: lineIndex })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={t('removeLine')}
                    onClick={() => reorder(removeLine(doc, sectionIndex, lineIndex))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
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
                  onClick={() => reorder(removeLine(doc, sectionIndex, lineIndex))}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}

          <div className="flex gap-1 self-start">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                const at = section.lines.length;
                reorder(insertLine(doc, sectionIndex, at, { type: 'line', items: [] }));
                setEditingLine({ section: sectionIndex, line: at });
              }}
            >
              <Plus />
              {t('addLine')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                const at = section.lines.length;
                reorder(insertLine(doc, sectionIndex, at, alphatexLine([])));
                setEditingTab({ section: sectionIndex, line: at });
              }}
            >
              <Plus />
              {t('addTab')}
            </Button>
          </div>
        </section>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => reorder(addSection(doc, t('defaultSection')))}
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
        onVoicing={(chord) => {
          const key = chordKey(chord);
          setTarget(null);
          if (key) {
            onEditVoicing(key);
          }
        }}
      />

      <TabEditorSheet
        source={(() => {
          const line = editingTab
            ? doc.sections[editingTab.section]?.lines[editingTab.line]
            : undefined;
          return line?.type === 'alphatex' ? line.source : null;
        })()}
        bpm={(editingTab ? doc.sections[editingTab.section]?.tempo : null) ?? songBpm}
        sound={sound}
        player={player}
        onSave={(source) => {
          if (editingTab) {
            onChange(setLine(doc, editingTab.section, editingTab.line, alphatexLine(source)));
          }
          setEditingTab(null);
        }}
        onClose={() => {
          const line = editingTab
            ? doc.sections[editingTab.section]?.lines[editingTab.line]
            : undefined;
          // A block that was added and never written is dropped.
          if (editingTab && line?.type === 'alphatex' && line.source.length === 0) {
            reorder(removeLine(doc, editingTab.section, editingTab.line));
          }
          setEditingTab(null);
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

/** The section's own tempo; empty shows the song tempo and means «as the song». */
function SectionTempo({
  value,
  songBpm,
  onChange,
}: {
  value: number | null;
  songBpm: number;
  onChange: (tempo: number | null) => void;
}) {
  const t = useTranslations('editor');
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);

  const commit = () => {
    const tempo = Number(text);
    if (!text) {
      onChange(null);
    } else if (isTempo(tempo)) {
      onChange(tempo);
    } else {
      setText(shown);
    }
  };

  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Input already carries its own aria-label
    <label className="flex items-center gap-1 text-muted-foreground text-xs">
      <Input
        type="number"
        inputMode="numeric"
        aria-label={t('sectionTempo')}
        placeholder={String(songBpm)}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
        className="h-8 w-16 px-2 text-center tabular-nums"
      />
      bpm
    </label>
  );
}
