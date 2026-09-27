'use client';

import type { Rhythm, SongDoc } from '@chordtune/chord-sheet';
import { Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
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
import { LineView, TabView } from '@/features/song/line-view';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useWakeLock } from './use-wake-lock';
import { advanceClock } from './zen-clock';
import { zenLines, zenOffset, zenPosition } from './zen-timing';

const COUNT_FROM = 3;
const COUNT_MS = 700;
const ANCHOR = 0.34;
const MIN_BPM = 40;
const MAX_BPM = 220;
const BPM_STEP = 5;

type Phase = 'count' | 'play' | 'pause' | 'done';

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Full-screen play-along: after a 3-2-1 count the lyrics scroll by themselves in tempo — each
 * line stays as long as its chords last, then the next one glides in.
 */
export function ZenMode({
  doc,
  rhythms,
  initialBpm,
  title,
  artist,
  played,
  onFinished,
  onClose,
}: {
  doc: SongDoc;
  rhythms: Rhythm[];
  initialBpm: number;
  title: string;
  artist: string;
  /** The viewer's play count, shown on the finish card. */
  played: number;
  onFinished: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('zen');
  const [bpm, setBpm] = useState(initialBpm);
  const [phase, setPhase] = useState<Phase>('count');
  const [count, setCount] = useState(COUNT_FROM);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const finished = useRef(false);
  const lines = useMemo(() => zenLines(doc, rhythms, bpm), [doc, rhythms, bpm]);
  const total = lines.at(-1)?.end ?? 0;
  const position = zenPosition(lines, time);
  const current = lines[position.index];
  const next = lines[position.index + 1];

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
      timeRef.current = advanceClock(timeRef.current, now - last);
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

  const changeBpm = (delta: number) => {
    const nextBpm = Math.min(MAX_BPM, Math.max(MIN_BPM, bpm + delta));
    // Keep the place in the song: every duration scales with 1 / bpm.
    timeRef.current = (timeRef.current * bpm) / nextBpm;
    setTime(timeRef.current);
    setBpm(nextBpm);
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
    } else if (phase === 'pause') {
      setPhase('play');
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === ' ') {
        event.preventDefault();
        setPhase((current) =>
          current === 'play' ? 'pause' : current === 'pause' ? 'play' : current,
        );
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
  useLayoutEffect(() => {
    const height = viewport.current?.clientHeight ?? 0;
    const top = (key?: string) => (key ? (rows.current.get(key)?.offsetTop ?? 0) : 0);
    const from = top(current ? `${current.section}:${current.line}` : undefined);
    const to = next ? top(`${next.section}:${next.line}`) : from;
    setOffset(height * ANCHOR - (from + (to - from) * zenOffset(position.progress)));
  }, [current, next, position.progress]);

  const zenIndex = useMemo(
    () => new Map(lines.map((line, index) => [`${line.section}:${line.line}`, index])),
    [lines],
  );
  const beat = Math.floor(time / (60 / bpm)) % 4;
  const currentSection = current ? doc.sections[current.section]?.label : null;

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label={title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-background"
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

      <div ref={viewport} className="-mt-20 relative flex-1 overflow-hidden">
        <button
          type="button"
          aria-label={phase === 'play' ? t('pause') : t('resume')}
          title={t('tapToPause')}
          className="absolute inset-0 z-10 cursor-default"
          onClick={togglePause}
        />
        <div
          className="absolute inset-x-0 top-0 px-6 will-change-transform"
          style={{ transform: `translateY(${offset}px)` }}
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
                const index = zenIndex.get(key);
                const isCurrent =
                  index !== undefined && index === position.index && phase !== 'count';
                const isPast =
                  current !== undefined &&
                  (sectionIndex < current.section ||
                    (sectionIndex === current.section && lineIndex < current.line));
                return (
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
                      isCurrent ? 'scale-[1.04] opacity-100' : isPast ? 'opacity-15' : 'opacity-35',
                    )}
                  >
                    {line.type === 'tab' ? (
                      <TabView lines={line.lines} />
                    ) : (
                      <LineView
                        items={line.items}
                        activeItem={
                          isCurrent ? (current?.chordItems[position.chord] ?? null) : null
                        }
                      />
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
          <div className="h-[70vh]" />
        </div>
      </div>

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
          {clock(time)} / {clock(total)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('slower')}
            className="rounded-xl bg-surface"
            onClick={() => changeBpm(-BPM_STEP)}
          >
            <Minus />
          </Button>
          <span className="w-16 text-center font-semibold text-sm tabular-nums">{bpm} BPM</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('faster')}
            className="rounded-xl bg-surface"
            onClick={() => changeBpm(BPM_STEP)}
          >
            <Plus />
          </Button>
        </div>
      </footer>

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
