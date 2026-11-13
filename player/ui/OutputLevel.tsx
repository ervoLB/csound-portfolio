import { useEffect, useRef, useState } from 'react';
import type { CsoundEngine } from '../engine/CsoundEngine';

/** Per level report (~30 per second): about 20 dB of fall per second. */
const FALLOFF = 0.86;
/** Cells of the text meter. */
const TEXT_CELLS = 10;

/** -60 dBFS .. 0 dBFS → 0 .. 100 %. */
export function levelPercent(v: number): number {
  return v <= 0.001 ? 0 : Math.max(0, Math.min(100, ((20 * Math.log10(v) + 60) / 60) * 100));
}

/** Peak in dBFS as short text: "-12 dB", "-inf". */
export function levelText(v: number): string {
  return v <= 0.001 ? '-inf' : `${Math.round(20 * Math.log10(v))} dB`;
}

/**
 * Output peak meter; red when the limiter had to step in.
 * `bars` (toolbar): two thin stereo bars. `text` (status line): character cells plus dBFS.
 */
export function OutputLevel({ engine, active, variant = 'bars' }: { engine: CsoundEngine; active: boolean; variant?: 'bars' | 'text' }) {
  const [level, setLevel] = useState({ l: 0, r: 0, clipped: false });
  const clipUntil = useRef(0);

  useEffect(() => {
    if (!active) {
      setLevel({ l: 0, r: 0, clipped: false });
      return;
    }
    return engine.on('level', ({ peakL, peakR, clipped }) => {
      const now = Date.now();
      if (clipped) clipUntil.current = now + 1200;
      // Peak hold with falloff, so short percussive notes are still visible.
      setLevel((prev) => ({
        l: Math.max(peakL, prev.l * FALLOFF),
        r: Math.max(peakR, prev.r * FALLOFF),
        clipped: now < clipUntil.current,
      }));
    });
  }, [engine, active]);

  const title = level.clipped ? 'Output was too loud and has been limited' : 'Output level';
  if (variant === 'text') {
    const peak = Math.max(level.l, level.r);
    const pct = levelPercent(peak);
    const on = pct > 0 ? Math.max(1, Math.round((pct / 100) * TEXT_CELLS)) : 0;
    return (
      <span className={`cp-level cp-level--text${level.clipped ? ' cp-level--clipped' : ''}`} title={title} aria-hidden="true">
        <span className="cp-level__bar cp-level__cells" style={{ ['--cp-level' as string]: `${pct}%` }}>
          {Array.from({ length: TEXT_CELLS }, (_, i) => (
            <span key={i} className="cp-cell" data-on={i < on ? 'true' : undefined} data-zone={i >= TEXT_CELLS - 1 ? 'danger' : i >= TEXT_CELLS - 2 ? 'warn' : undefined} />
          ))}
        </span>
        <span className="cp-level__db">{levelText(peak)}</span>
      </span>
    );
  }
  return (
    <div className={`cp-level${level.clipped ? ' cp-level--clipped' : ''}`} title={title} aria-hidden="true">
      <span className="cp-level__bar" style={{ ['--cp-level' as string]: `${levelPercent(level.l)}%` }} />
      <span className="cp-level__bar" style={{ ['--cp-level' as string]: `${levelPercent(level.r)}%` }} />
    </div>
  );
}
