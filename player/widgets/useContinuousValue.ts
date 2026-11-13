import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WidgetDef } from '../meta/types';
import { useChannel } from './runtime';
import { clampToStep, denormalizeScale, formatWidgetValue, keyboardStep, normalizeScale, toFiniteNumber } from './valueMath';

/** Pixels of drag for a full sweep (Shift = 10× finer). */
export const DRAG_PIXELS_FULL_RANGE = 200;

/**
 * Shared logic for knob and slider: channel value, normalised position, relative
 * dragging that keeps sub-step movement, keyboard control, and reset to default.
 */
export function useContinuousValue(def: WidgetDef) {
  const min = toFiniteNumber(def.min, 0);
  const max = toFiniteNumber(def.max, 1);
  const step = def.step !== undefined ? toFiniteNumber(def.step, NaN) : undefined;
  const validStep = step !== undefined && Number.isFinite(step) && step > 0 ? step : undefined;
  const scale = def.scale;
  const fallback = clampToStep(toFiniteNumber(def.default, min), min, max, validStep);
  const [value, setChannelValue] = useChannel(def.channel_name, fallback);
  const norm = normalizeScale(value, min, max, scale);

  // Unsnapped drag position, so slow drags still move through small steps.
  const dragNorm = useRef<number | null>(null);
  const set = useCallback(
    (next: number) => setChannelValue(clampToStep(next, min, max, validStep)),
    [setChannelValue, min, max, validStep],
  );

  const setNormalized = useCallback((n: number) => set(denormalizeScale(n, min, max, scale)), [set, min, max, scale]);

  const beginDrag = useCallback(() => {
    dragNorm.current = norm;
  }, [norm]);

  const dragBy = useCallback(
    (pixels: number, fine: boolean) => {
      const start = dragNorm.current ?? norm;
      const next = Math.max(0, Math.min(1, start + pixels / (DRAG_PIXELS_FULL_RANGE * (fine ? 10 : 1))));
      dragNorm.current = next;
      setNormalized(next);
    },
    [norm, setNormalized],
  );

  const endDrag = useCallback(() => {
    dragNorm.current = null;
  }, []);

  const reset = useCallback(() => set(fallback), [set, fallback]);

  // Typing an exact value: double-click the value text, or Enter on the control.
  const [editing, setEditing] = useState(false);
  const control = useRef<Element | null>(null);
  const controlRef = useCallback((el: Element | null) => {
    control.current = el;
  }, []);
  const startEdit = useCallback(() => setEditing(true), []);
  const finishEdit = useCallback(
    (typed: number | null, how: 'enter' | 'escape' | 'blur') => {
      setEditing(false);
      if (typed !== null) set(typed);
      // Back to the control after Enter/Escape, so the arrow keys keep working.
      if (how !== 'blur') (control.current as HTMLElement | SVGElement | null)?.focus?.();
    },
    [set],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      const inc = keyboardStep(min, max, validStep) * (event.shiftKey ? 10 : 1);
      let next: number | null = null;
      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          next = value + inc;
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          next = value - inc;
          break;
        case 'PageUp':
          next = value + inc * 10;
          break;
        case 'PageDown':
          next = value - inc * 10;
          break;
        case 'Home':
          next = min;
          break;
        case 'End':
          next = max;
          break;
        case 'Enter':
          event.preventDefault();
          setEditing(true);
          return;
        default:
          return;
      }
      event.preventDefault();
      set(next);
    },
    [value, min, max, validStep, set],
  );

  return {
    value,
    norm,
    min,
    max,
    step: validStep,
    display: formatWidgetValue(value, validStep),
    set,
    setNormalized,
    beginDrag,
    dragBy,
    endDrag,
    reset,
    onKeyDown,
    editing,
    startEdit,
    finishEdit,
    controlRef,
  };
}
