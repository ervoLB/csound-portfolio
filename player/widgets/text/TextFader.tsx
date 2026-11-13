import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { DRAG_PIXELS_FULL_RANGE, useContinuousValue } from '../useContinuousValue';
import { useDrag } from '../useDrag';
import { toFiniteNumber } from '../valueMath';
import { EditableValue } from '../EditableValue';
import type { WidgetProps } from '../types';

/** Number of character cells in a text fader. */
export const FADER_CELLS = 16;

/** Cells filled for a normalised value: 0 → none, 1 → all, anything above 0 → at least one. */
export function filledCells(norm: number, cells = FADER_CELLS): number {
  if (!(norm > 0)) return 0;
  return Math.max(1, Math.min(cells, Math.round(norm * cells)));
}

/**
 * Text-style replacement for knob and slider: `Cutoff  ■■■■■■□□□□□□□□□□  2000`.
 * The cells are empty spans; the layout's CSS draws their glyphs, so each design
 * can pick its own characters. Click jumps to a cell, dragging (horizontal or
 * vertical, Shift = fine) is relative, keys and double-click reset come from
 * useContinuousValue.
 */
export function TextFader({ def }: WidgetProps) {
  const v = useContinuousValue(def);
  const label = def.label ?? def.channel_name ?? '';
  const showValue = def.showValue !== false;
  const cells = Math.max(6, Math.min(32, Math.round(toFiniteNumber(def.cells, FADER_CELLS))));
  const filled = filledCells(v.norm, cells);

  const hasLayout = useRef(false);
  const dragNorm = useRef<number | null>(null);
  const drag = useDrag({
    onStart: ({ x }) => {
      dragNorm.current = hasLayout.current ? x : v.norm;
      if (hasLayout.current) v.setNormalized(x);
    },
    onMove: ({ dx, dy, fine }) => {
      const start = dragNorm.current ?? v.norm;
      const pixels = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      const next = Math.max(0, Math.min(1, start + pixels / (DRAG_PIXELS_FULL_RANGE * (fine ? 10 : 1))));
      dragNorm.current = next;
      v.setNormalized(next);
    },
    onEnd: () => {
      dragNorm.current = null;
    },
  });
  const onPointerDownCapture = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    hasLayout.current = rect.width > 0 && rect.height > 0;
  };

  return (
    <div className="cp-widget cp-widget--text cp-tfader" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      <span className="cp-widget__label cp-tfader__label">{label}</span>
      <span
        ref={v.controlRef}
        className="cp-tfader__cells"
        role="slider"
        tabIndex={0}
        aria-label={label || 'Fader'}
        aria-orientation="horizontal"
        aria-valuemin={v.min}
        aria-valuemax={v.max}
        aria-valuenow={v.value}
        aria-valuetext={v.display}
        aria-keyshortcuts="Enter"
        onKeyDown={v.onKeyDown}
        onDoubleClick={v.reset}
        onPointerDownCapture={onPointerDownCapture}
        {...drag}
      >
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className="cp-cell" data-on={i < filled ? 'true' : undefined} aria-hidden="true" />
        ))}
      </span>
      {showValue || v.editing ? (
        <EditableValue
          className="cp-widget__value cp-tfader__value"
          display={v.display}
          value={v.value}
          editing={v.editing}
          onStart={v.startEdit}
          onDone={v.finishEdit}
          label={label}
        />
      ) : (
        <span className="cp-widget__value cp-tfader__value" />
      )}
    </div>
  );
}
