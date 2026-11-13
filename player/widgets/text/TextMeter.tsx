import { useChannel } from '../runtime';
import { formatWidgetValue, toFiniteNumber } from '../valueMath';
import type { WidgetProps } from '../types';
import { FADER_CELLS, filledCells } from './TextFader';

/** Zone of one cell, by its position in the scale (same thresholds as the graphic meter). */
export function cellZone(index: number, cells: number): 'warn' | 'danger' | undefined {
  const top = (index + 1) / cells;
  return top > 0.98 ? 'danger' : top > 0.85 ? 'warn' : undefined;
}

/** Read-only text meter: `Level  ■■■■■□□□□□□□□□□□  0.32`. */
export function TextMeter({ def }: WidgetProps) {
  const rawMin = toFiniteNumber(def.min, 0);
  const rawMax = toFiniteNumber(def.max, 1);
  const lo = Math.min(rawMin, rawMax);
  const hi = Math.max(rawMin, rawMax);
  const step = def.step !== undefined ? toFiniteNumber(def.step, NaN) : NaN;
  const validStep = Number.isFinite(step) && step > 0 ? step : undefined;
  const [published] = useChannel(def.channel_name, lo);
  const value = Math.max(lo, Math.min(hi, toFiniteNumber(published, lo)));
  const fraction = Math.max(0, Math.min(1, (value - lo) / (hi - lo || 1)));
  const cells = Math.max(6, Math.min(32, Math.round(toFiniteNumber(def.cells, FADER_CELLS))));
  const filled = filledCells(fraction, cells);
  const label = def.label ?? def.channel_name ?? '';
  const display = formatWidgetValue(value, validStep);

  return (
    <div className="cp-widget cp-widget--text cp-tmeter" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      <span className="cp-widget__label cp-tfader__label">{label}</span>
      <span
        className="cp-tfader__cells cp-tmeter__cells"
        role="meter"
        aria-label={label || 'Meter'}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={value}
        aria-valuetext={display}
      >
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className="cp-cell" data-on={i < filled ? 'true' : undefined} data-zone={cellZone(i, cells)} aria-hidden="true" />
        ))}
      </span>
      <span className="cp-widget__value cp-tfader__value">{def.showValue !== false ? display : ''}</span>
    </div>
  );
}
