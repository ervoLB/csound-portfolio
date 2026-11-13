import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { DRAG_PIXELS_FULL_RANGE, useContinuousValue } from './useContinuousValue';
import { useDrag } from './useDrag';
import { EditableValue } from './EditableValue';
import { toFiniteNumber } from './valueMath';
import type { WidgetProps } from './types';

/** Clamp a size hint (height for vertical, width for horizontal) to sane bounds. */
function lengthHint(value: unknown, fallback: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, toFiniteNumber(value, fallback)));
}

/**
 * Linear counterpart of the knob. Clicking the track jumps to that position;
 * the drag that follows is relative (Shift = fine), so grabbing the thumb never
 * makes it slip. Arrow keys and double-click-reset come from useContinuousValue.
 */
export function Slider({ def }: WidgetProps) {
  const v = useContinuousValue(def);
  const vertical = def.orientation !== 'horizontal';
  const length = lengthHint(vertical ? def.height : def.width, vertical ? 140 : 180, vertical ? 60 : 80, 320);
  const label = def.label ?? def.channel_name ?? '';
  const showValue = def.showValue !== false;
  const thumbColor = typeof def.thumbColor === 'string' ? def.thumbColor : undefined;
  const trackColor = typeof def.trackColor === 'string' ? def.trackColor : undefined;
  const fillColor = typeof def.fillColor === 'string' ? def.fillColor : undefined;

  // A zero-sized rect (jsdom, or a hidden widget) carries no position information.
  // In that case pointer-down starts a relative drag from the current value
  // instead of jumping to an arbitrary end of the track.
  const hasLayout = useRef(false);
  const dragNorm = useRef<number | null>(null);
  const drag = useDrag({
    onStart: ({ x, y }) => {
      const position = vertical ? 1 - y : x;
      dragNorm.current = hasLayout.current ? position : v.norm;
      if (hasLayout.current) v.setNormalized(position);
    },
    onMove: ({ dx, dy, fine }) => {
      const start = dragNorm.current ?? v.norm;
      const pixels = vertical ? dy : dx;
      const next = Math.max(0, Math.min(1, start + pixels / (DRAG_PIXELS_FULL_RANGE * (fine ? 10 : 1))));
      dragNorm.current = next;
      v.setNormalized(next);
    },
    onEnd: () => {
      dragNorm.current = null;
    },
  });

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    hasLayout.current = rect.width > 0 && rect.height > 0;
  };

  const pct = `${v.norm * 100}%`;
  const fillStyle = vertical
    ? { height: pct, backgroundColor: fillColor }
    : { width: pct, backgroundColor: fillColor };
  const thumbStyle = vertical
    ? { bottom: pct, backgroundColor: thumbColor }
    : { left: pct, backgroundColor: thumbColor };

  return (
    <div className="cp-widget cp-widget--slider" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      {label && <span className="cp-widget__label">{label}</span>}
      <div
        ref={v.controlRef}
        className={`cp-slider cp-slider--${vertical ? 'vertical' : 'horizontal'}`}
        style={vertical ? { height: `${length}px` } : { width: `${length}px` }}
        role="slider"
        tabIndex={0}
        aria-label={label || 'Slider'}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
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
        <div className="cp-slider__track" style={trackColor ? { backgroundColor: trackColor } : undefined}>
          <div className="cp-slider__fill" style={fillStyle} />
          <div className="cp-slider__thumb" style={thumbStyle} />
        </div>
      </div>
      <EditableValue display={v.display} value={v.value} editing={v.editing} onStart={v.startEdit} onDone={v.finishEdit} label={label} hidden={!showValue} />
    </div>
  );
}
