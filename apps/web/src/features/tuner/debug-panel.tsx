'use client';

import type { AnalyzerDebug, TunerFrame } from '@chordtune/audio';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type { FrameStore } from './frame-store';

type Plot = 'waveform' | 'spectrum' | 'yin';

const COLORS: Record<Plot, string> = {
  waveform: '#7ee0c0',
  spectrum: '#93c5fd',
  yin: '#c4b5fd',
};

function drawPlot(canvas: HTMLCanvasElement, plot: Plot, debug: AnalyzerDebug) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = canvas.clientHeight * ratio;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = COLORS[plot];
  ctx.fillStyle = COLORS[plot];
  ctx.lineWidth = 1.5 * ratio;

  if (plot === 'spectrum') {
    const values = debug.spectrum;
    const barWidth = width / values.length;
    for (let i = 0; i < values.length; i++) {
      const barHeight = (values[i] ?? 0) * height;
      ctx.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - ratio), barHeight);
    }
    return;
  }

  const values = plot === 'waveform' ? debug.waveform : debug.yin;
  const toY =
    plot === 'waveform'
      ? (value: number) => height / 2 - value * (height / 2) * 0.9
      : (value: number) => Math.min(height, value * height * 0.9 + height * 0.05);
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = toY(values[i] ?? 0);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  if (plot === 'yin' && debug.yinMarker != null) {
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(debug.yinMarker * width - ratio, 0, 2 * ratio, height);
  }
}

export function DebugPanel({ store }: { store: FrameStore }) {
  const t = useTranslations('tuner.debugPanel');
  const canvases = useRef<Record<Plot, HTMLCanvasElement | null>>({
    waveform: null,
    spectrum: null,
    yin: null,
  });
  const caption = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let raf = 0;
    let pending: TunerFrame | null = null;

    const render = () => {
      raf = 0;
      const debug = pending?.debug;
      if (!pending || !debug) {
        return;
      }
      for (const plot of ['waveform', 'spectrum', 'yin'] as const) {
        const canvas = canvases.current[plot];
        if (canvas) {
          drawPlot(canvas, plot, debug);
        }
      }
      if (caption.current) {
        caption.current.textContent = [
          t('confidence', { value: Math.round(pending.confidence * 100) }),
          t('gain', { value: debug.appliedGain.toFixed(1) }),
          t('fftPeak', { value: Math.round(debug.fftPeakHz) }),
          t('window', { size: debug.windowSize, rate: debug.sampleRate }),
        ].join(' · ');
      }
    };

    const unsubscribe = store.subscribe((frame) => {
      pending = frame;
      raf ||= requestAnimationFrame(render);
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [store, t]);

  return (
    <section className="grid w-full gap-3 rounded-xl border border-border/60 bg-card/60 p-3 sm:grid-cols-3">
      {(['waveform', 'spectrum', 'yin'] as const).map((plot) => (
        <figure key={plot} className="flex flex-col gap-1">
          <figcaption className="text-muted-foreground text-xs">{t(plot)}</figcaption>
          <canvas
            ref={(node) => {
              canvases.current[plot] = node;
            }}
            className="h-20 w-full rounded-md bg-background/60"
          />
        </figure>
      ))}
      <p ref={caption} className="font-mono text-[11px] text-muted-foreground sm:col-span-3" />
    </section>
  );
}
