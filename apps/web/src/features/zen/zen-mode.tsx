'use client';

import { type Rhythm, type SongDoc, tabBeats, type ZenModeId } from '@chordtune/chord-sheet';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import type { SongSound } from '@/features/rhythm/playback';
import { LineView, TabView } from '@/features/song/line-view';
import { tabBeatQuarters } from '@/features/tab/tab-layout';
import { TabStaff } from '@/features/tab/tab-staff';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useWakeLock } from './use-wake-lock';
import { advanceClock } from './zen-clock';
import { ZenPanel } from './zen-panel';
import { ZenStrip } from './zen-strip';
import { zenLines, zenOffset, zenPosition, zenRowGlide } from './zen-timing';
import {
  clampNudge,
  ownsSpaceKey,
  type RowEmphasis,
  rowEmphasis,
  sectionStrip,
  seekTime,
} from './zen-view';

const COUNT_FROM = 3;
const COUNT_MS = 700;
const ANCHOR = 0.34;
/** Below this many pixels of pointer movement, a drag on the paused text is still a tap. */
const DRAG_THRESHOLD_PX = 6;

type Phase = 'ready' | 'count' | 'play' | 'pause' | 'done';

/** How bright a row is, by its distance from the row currently playing. */
const EMPHASIS: Record<RowEmphasis, string> = {
  current: 'opacity-100',
  next: 'opacity-75',
  after: 'opacity-55',
  later: 'opacity-30',
  past: 'opacity-15',
};

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Full-screen play-along: a ready panel picks how chords look, speed and capo, then after a
 * 3-2-1 count the lyrics scroll by themselves in tempo — each line stays as long as its chords
 * last, then the next one glides in.
 */
export function ZenMode({
  doc,
  rhythms,
  bpm,
  speed,
  onSpeedChange,
  mode,
  onModeChange,
  sound,
  capoControl,
  title,
  artist,
  played,
  onFinished,
  onClose,
}: {
  doc: SongDoc;
  rhythms: Rhythm[];
  /** The song tempo; section and block tempos come from the document. */
  bpm: number;
  /** Playback speed: time is song time, so changing it keeps the place in the song. */
  speed: number;
  onSpeedChange: (speed: number) => void;
  /** Chords above the words, or the section's chord strip. */
  mode: ZenModeId;
  onModeChange: (mode: ZenModeId) => void;
  sound: SongSound;
  /** The listener's capo picker, shown in the ready/pause panel. */
  capoControl?: React.ReactNode;
  title: string;
  artist: string;
  /** The viewer's play count, shown on the finish card. */
  played: number;
  onFinished: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('zen');
  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(COUNT_FROM);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const finished = useRef(false);
  const lines = useMemo(() => zenLines(doc, rhythms, bpm), [doc, rhythms, bpm]);
  const total = lines.at(-1)?.end ?? 0;
  const position = zenPosition(lines, time);
  const current = lines[position.index];
  const next = lines[position.index + 1];
  const currentLine = current ? doc.sections[current.section]?.lines[current.line] : undefined;
  // The active beat of the current line's tab block, if it is one — shared by the staff
  // highlight below and by the row-to-row scroll glide in the layout effect further down.
  const activeTabBeat =
    current && currentLine?.type === 'alphatex'
      ? (() => {
          const beat = tabBeats(currentLine.block)[current.chordItems[position.chord] ?? -1];
          return beat ? { bar: beat.bar, beat: beat.beat } : null;
        })()
      : null;

  useWakeLock(phase !== 'done');

  // Countdown, then play.
  useEffect(() => {
    if (phase !== 'count') {
      return;
    }
    if (count === 0) {
      setPhase('play');
      return;
    }
    const timer = setTimeout(() => setCount((n) => n - 1), COUNT_MS);
    return () => clearTimeout(timer);
  }, [phase, count]);

  // The playback clock.
  useEffect(() => {
    if (phase !== 'play') {
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      timeRef.current = advanceClock(timeRef.current, now - last, speedRef.current);
      last = now;
      setTime(timeRef.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase === 'play' && position.done && !finished.current) {
      finished.current = true;
      setPhase('done');
      onFinished();
    }
  }, [phase, position.done, onFinished]);

  // Leaving the app pauses the song instead of letting it run on unseen.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        setPhase((current) => (current === 'play' ? 'pause' : current));
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // While paused: the listener can drag/scroll the text and tap a line or chord to pick where
  // the next start/resume plays from. `paused` covers both the ready panel and an in-song pause.
  const paused = phase === 'ready' || phase === 'pause';
  const [nudge, setNudge] = useState(0);
  const [startAt, setStartAt] = useState<{ time: number; key: string; item: number | null } | null>(
    null,
  );
  const content = useRef<HTMLDivElement>(null);
  // The empty run-out below the last row: its top is where the rows end.
  const runOut = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; from: number; moved: boolean; captured: boolean } | null>(null);
  const dragged = useRef(false);

  const clamp = (value: number) => {
    const height = viewport.current?.clientHeight ?? 0;
    // Up to the bottom of the last row, not the content's full height: that includes the
    // run-out, and a drag clamped to it could leave nothing but empty run-out on screen.
    const length = runOut.current?.offsetTop ?? 0;
    return clampNudge(offset, value, height, length);
  };

  // Not a useCallback: it now reads startAt state, so it must stay fresh on every render.
  // togglePause (reassigned to togglePauseRef below on every render) closes over this, so the
  // keyboard handler that calls togglePauseRef.current() always reaches the latest version.
  const start = () => {
    if (startAt) {
      timeRef.current = startAt.time;
      finished.current = false;
      setTime(startAt.time);
    }
    setStartAt(null);
    setNudge(0);
    drag.current = null;
    dragged.current = false;
    setCount(COUNT_FROM);
    setPhase('count');
  };

  const fromStart = () => {
    timeRef.current = 0;
    finished.current = false;
    setTime(0);
    setStartAt(null);
    setNudge(0);
    drag.current = null;
    // Back at the top of the song, the panel offers «Начать» again, not «Продолжить».
    setPhase('ready');
  };

  /**
   * A tap on a paused line (its first chord) or one of its chords (`item`). An untimed line has
   * no `ZenLine` of its own, so `seekTime` resolves it to the next timed line; the ring (and the
   * highlighted chord, if any) goes on that resolved line, not the tapped one, so it always
   * matches where playback will actually start. Cleared by the next start/resume.
   */
  const pick = (section: number, line: number, item: number | null = null) => {
    const time = seekTime(lines, section, line, item);
    if (time === null) {
      return;
    }
    const resolved = lines.find(
      (zen) => zen.section > section || (zen.section === section && zen.line >= line),
    );
    const onTappedLine = resolved?.section === section && resolved.line === line;
    const key = resolved ? `${resolved.section}:${resolved.line}` : `${section}:${line}`;
    setStartAt({ time, key, item: onTappedLine ? item : null });
  };

  const restart = useCallback(() => {
    timeRef.current = 0;
    finished.current = false;
    setTime(0);
    setCount(COUNT_FROM);
    setPhase('count');
  }, []);

  const togglePause = () => {
    if (phase === 'play') {
      setPhase('pause');
    } else if (phase === 'ready' || phase === 'pause') {
      start();
    }
  };
  // The key handler below runs from an effect with a narrow dependency list (so it does not
  // resubscribe on every phase change), so it reads the latest togglePause through a ref.
  const togglePauseRef = useRef(togglePause);
  togglePauseRef.current = togglePause;

  // Zen takes focus when it opens, so Space starts the song instead of pressing the dock's play
  // button behind it again; that button (or whatever had focus) gets it back on close.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // An open popover (the capo list) closes first; zen only on the next Escape.
        if (
          !event.defaultPrevented &&
          !document.querySelector('[data-slot="popover-content"][data-open]')
        ) {
          onClose();
        }
      } else if (event.key === ' ') {
        // Space on a focused button, chip or row in zen presses that control, not start/pause.
        const target = event.target instanceof Element ? event.target : null;
        const zen = root.current;
        if (event.defaultPrevented || (zen && ownsSpaceKey(target, zen))) {
          return;
        }
        event.preventDefault();
        togglePauseRef.current();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Scroll: the current line sits at 34% of the screen and glides to the next near its end.
  const viewport = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const [offset, setOffset] = useState(0);
  // Bumped whenever the viewport or the text changes size while the clock may be standing still
  // (a view switch re-lays the chord rows and adds/removes the strip, the strip's shapes open,
  // the tall panel gives way to the short play footer), so the effect below re-places the line.
  const [layout, setLayout] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(() => setLayout((n) => n + 1));
    for (const element of [viewport.current, content.current]) {
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mode` and `layout` change the rows' measured positions
  useLayoutEffect(() => {
    const height = viewport.current?.clientHeight ?? 0;
    const element = (key?: string) => (key ? rows.current.get(key) : undefined);
    const currentElement = element(current ? `${current.section}:${current.line}` : undefined);
    const nextElement = next ? element(`${next.section}:${next.line}`) : undefined;

    let from = currentElement?.offsetTop ?? 0;
    let to = nextElement?.offsetTop ?? from;
    let progress = position.progress;

    // Inside a multi-row tab block, glide row to row within the active beat's own row (by its
    // share of the block, in quarter notes) instead of the whole line's progress, which would
    // otherwise jump by a row's height the moment the highlighted row changes.
    if (currentElement && currentLine?.type === 'alphatex' && activeTabBeat) {
      const rowElements = Array.from(
        currentElement.querySelectorAll<HTMLElement>('[data-row-start-beat]'),
      );
      if (rowElements.length > 0) {
        const starts = rowElements.map((row) => Number(row.dataset.rowStartBeat));
        const total = tabBeatQuarters(currentLine.block, currentLine.block.bars.length);
        const quarters = tabBeatQuarters(currentLine.block, activeTabBeat.bar, activeTabBeat.beat);
        const glide = zenRowGlide(starts, total, quarters);
        from = rowElements[glide.index]?.offsetTop ?? from;
        to = rowElements[glide.index + 1]?.offsetTop ?? to;
        progress = glide.progress;
      }
    }

    setOffset(height * ANCHOR - (from + (to - from) * zenOffset(progress)));
  }, [current, next, currentLine, activeTabBeat, position.progress, mode, layout]);

  // Every line of the document, in the order it is shown, so each one's brightness can be set
  // by its distance from the row currently playing.
  const rowIndex = useMemo(
    () =>
      new Map(
        doc.sections
          .flatMap((section, s) => section.lines.map((_, l) => `${s}:${l}`))
          .map((key, index) => [key, index]),
      ),
    [doc],
  );
  const currentRow = current ? (rowIndex.get(`${current.section}:${current.line}`) ?? -1) : -1;

  // `position` is a fresh object every frame: memo the strip on the values that actually
  // change it, so it is not rebuilt on every tick (and the memo'd ZenStrip skips those renders).
  const { index: playingIndex, chord: playingChord } = position;
  const strip = useMemo(
    () =>
      sectionStrip(doc, lines, {
        index: playingIndex,
        chord: playingChord,
        progress: 0,
        done: false,
      }),
    [doc, lines, playingIndex, playingChord],
  );

  const beatSec = 60 / (current?.tempo ?? bpm);
  const beat = Math.floor(Math.max(0, time - (current?.start ?? 0)) / beatSec) % 4;
  const currentSection = current ? doc.sections[current.section]?.label : null;

  return (
    <motion.div
      ref={root}
      role="dialog"
      aria-modal
      aria-label={title}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-background outline-none"
    >
      <div className="absolute inset-x-0 top-0 z-20 h-0.5 bg-surface-2">
        <div
          className="h-full bg-primary shadow-glow"
          style={{ width: `${total ? Math.min(100, (time / total) * 100) : 0}%` }}
        />
      </div>

      <header className="relative z-10 flex items-center gap-3 bg-linear-to-b from-background from-60% to-transparent px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('close')}
          className="rounded-xl bg-surface"
          onClick={onClose}
        >
          <X />
        </Button>
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{title}</span>
          <span className="text-muted-foreground"> · {artist}</span>
        </div>
        {currentSection && <span className="text-muted-foreground text-xs">{currentSection}</span>}
      </header>

      {mode === 'strip' && <ZenStrip strip={strip} sound={sound} />}

      <div
        ref={viewport}
        className={cn('-mt-20 relative flex-1 overflow-hidden', paused && 'touch-none select-none')}
        onWheel={(event) => paused && setNudge((value) => clamp(value - event.deltaY))}
        onPointerDown={(event) => {
          // A touch drag that ends without a click never reaches onClickCapture to clear this,
          // so each new press starts clean — otherwise it would swallow the next tap.
          dragged.current = false;
          // A non-primary mouse button (right-click, middle-click) does not start a drag.
          if (paused && (event.pointerType !== 'mouse' || event.button === 0)) {
            drag.current = { y: event.clientY, from: nudge, moved: false, captured: false };
          }
        }}
        onPointerMove={(event) => {
          if (!paused) {
            // Resuming/starting can leave the pointer still down; stop reacting to its moves
            // immediately instead of waiting for a pointerup that may land outside the viewport.
            drag.current = null;
            return;
          }
          const current = drag.current;
          if (!current) {
            return;
          }
          const dy = event.clientY - current.y;
          if (Math.abs(dy) > DRAG_THRESHOLD_PX) {
            current.moved = true;
            if (!current.captured) {
              // Captured only once the drag is real, so a plain tap on a row/chord still
              // dispatches its click to that element rather than being retargeted here.
              event.currentTarget.setPointerCapture(event.pointerId);
              current.captured = true;
            }
          }
          if (current.moved) {
            setNudge(clamp(current.from + dy));
          }
        }}
        onPointerUp={(event) => {
          dragged.current = drag.current?.moved ?? false;
          if (drag.current?.captured) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          drag.current = null;
        }}
        onPointerCancel={(event) => {
          if (drag.current?.captured) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          drag.current = null;
        }}
        onClickCapture={(event) => {
          // A drag that ends over a line or a chord is not a tap.
          if (dragged.current) {
            dragged.current = false;
            event.stopPropagation();
            event.preventDefault();
          }
        }}
      >
        {phase === 'play' && (
          <button
            type="button"
            aria-label={t('pause')}
            title={t('tapToPause')}
            className="absolute inset-0 z-10 cursor-default"
            onClick={togglePause}
          />
        )}
        <div
          ref={content}
          className="absolute inset-x-0 top-0 px-6 will-change-transform"
          style={{ transform: `translateY(${offset + nudge}px)` }}
        >
          {doc.sections.map((section, sectionIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: sections are positional
            <Fragment key={sectionIndex}>
              {section.label !== null && (
                <p
                  className={cn(
                    'pt-5 pb-1 font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em] transition-opacity duration-500',
                    current && sectionIndex < current.section ? 'opacity-20' : 'opacity-70',
                  )}
                >
                  {section.label}
                </p>
              )}
              {section.lines.map((line, lineIndex) => {
                const key = `${sectionIndex}:${lineIndex}`;
                const emphasis = rowEmphasis(rowIndex.get(key) ?? -1, currentRow);
                const isCurrent = emphasis === 'current';
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: a row holds chord buttons, so it cannot be a <button>
                  <div
                    key={key}
                    ref={(element) => {
                      if (element) {
                        rows.current.set(key, element);
                      } else {
                        rows.current.delete(key);
                      }
                    }}
                    className={cn(
                      'origin-left py-2 text-xl transition-[opacity,transform] duration-500',
                      EMPHASIS[emphasis],
                      isCurrent && line.type === 'line' && 'scale-[1.04]',
                      startAt?.key === key && 'rounded-xl ring-2 ring-chord/60',
                    )}
                    role={paused ? 'button' : undefined}
                    tabIndex={paused ? 0 : undefined}
                    onClick={paused ? () => pick(sectionIndex, lineIndex) : undefined}
                    onKeyDown={
                      paused
                        ? (event) => {
                            if (event.target !== event.currentTarget) {
                              return;
                            }
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              pick(sectionIndex, lineIndex);
                            }
                          }
                        : undefined
                    }
                  >
                    {line.type === 'tab' ? (
                      <TabView lines={line.lines} />
                    ) : line.type === 'alphatex' ? (
                      <TabStaff block={line.block} activeBeat={isCurrent ? activeTabBeat : null} />
                    ) : (
                      <LineView
                        items={line.items}
                        activeItem={
                          paused && startAt?.key === key
                            ? startAt.item
                            : isCurrent
                              ? (current?.chordItems[position.chord] ?? null)
                              : null
                        }
                        marks={mode === 'strip' ? 'dots' : 'chips'}
                        onChord={
                          paused
                            ? (_chord, _anchor, item) => pick(sectionIndex, lineIndex, item)
                            : undefined
                        }
                      />
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
          <div ref={runOut} className="h-[70vh]" />
        </div>
      </div>

      {phase === 'ready' || phase === 'pause' ? (
        <footer className="relative z-30 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <ZenPanel
            phase={phase}
            mode={mode}
            onModeChange={onModeChange}
            speed={speed}
            onSpeedChange={onSpeedChange}
            capoControl={capoControl}
            onStart={start}
            onFromStart={fromStart}
          />
        </footer>
      ) : (
        <footer className="relative z-10 flex items-center gap-3 bg-linear-to-t from-background from-55% to-transparent px-4 pt-8 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button
            size="icon"
            aria-label={phase === 'play' ? t('pause') : t('resume')}
            className="size-11 rounded-2xl shadow-glow"
            disabled={phase === 'count' || phase === 'done'}
            onClick={togglePause}
          >
            {phase === 'play' ? <Pause /> : <Play />}
          </Button>
          <div className="flex gap-1.5" aria-hidden>
            {[0, 1, 2, 3].map((dot) => (
              <span
                key={dot}
                className={cn(
                  'size-2 rounded-full bg-surface-2 transition-colors duration-75',
                  phase === 'play' && dot === beat && 'bg-primary shadow-glow',
                )}
              />
            ))}
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {clock(time / speed)} / {clock(total / speed)}
          </span>
        </footer>
      )}

      <AnimatePresence>
        {phase === 'count' && count > 0 && (
          <motion.div
            key={count}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center font-extrabold text-8xl text-primary"
            initial={{ opacity: 0, scale: 1.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.35 }}
          >
            {count}
          </motion.div>
        )}
        {phase === 'done' && (
          <motion.div
            className="absolute inset-x-6 top-1/2 z-30 mx-auto flex max-w-sm -translate-y-1/2 flex-col items-center gap-3 rounded-3xl border border-primary/35 bg-popover/95 p-6 text-center shadow-glow backdrop-blur-xl"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={spring.pop}
          >
            <span className="font-extrabold text-5xl text-primary">{t('doneTitle')}</span>
            <span className="text-sm">{t('doneText', { count: played })}</span>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={restart}>
                <RotateCcw />
                {t('again')}
              </Button>
              <Button onClick={onClose}>{t('finish')}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
