import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface DragDelta {
  /** Horizontal movement in pixels since the last event (right = positive). */
  dx: number;
  /** Vertical movement in pixels since the last event (up = positive). */
  dy: number;
  /** True while Shift is held: callers use it for fine adjustment. */
  fine: boolean;
  /** Pointer position relative to the element (0..1), for absolute widgets (XY pad, slider click). */
  x: number;
  y: number;
}

export interface UseDragOptions {
  onStart?: (delta: DragDelta) => void;
  onMove: (delta: DragDelta) => void;
  onEnd?: () => void;
}

/**
 * Pointer drag with pointer capture, for mouse, pen and touch. Movement is
 * reported incrementally so widgets can keep their own sub-step position.
 */
export function useDrag({ onStart, onMove, onEnd }: UseDragOptions) {
  const last = useRef<{ x: number; y: number } | null>(null);

  const relative = (event: ReactPointerEvent<Element>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0,
      y: rect.height > 0 ? Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) : 0,
    };
  };

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      try {
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      } catch {
        /* pointer already gone (e.g. synthetic events) */
      }
      (event.currentTarget as HTMLElement).focus?.({ preventScroll: true });
      last.current = { x: event.clientX, y: event.clientY };
      onStart?.({ dx: 0, dy: 0, fine: event.shiftKey, ...relative(event) });
    },
    [onStart],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (!last.current) return;
      const dx = event.clientX - last.current.x;
      const dy = last.current.y - event.clientY;
      last.current = { x: event.clientX, y: event.clientY };
      onMove({ dx, dy, fine: event.shiftKey, ...relative(event) });
    },
    [onMove],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (!last.current) return;
      last.current = null;
      try {
        (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
      } catch {
        /* not captured */
      }
      onEnd?.();
    },
    [onEnd],
  );

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
