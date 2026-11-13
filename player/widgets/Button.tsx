import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useChannel } from './runtime';
import type { WidgetProps } from './types';

const ACTIVATION_KEYS = new Set([' ', 'Enter', 'Spacebar']);

/**
 * Momentary (default): 1 while pressed, 0 on release. `mode: "toggle"` or
 * `"latch"` keeps the value until the next click and exposes aria-pressed.
 * Pointer and keyboard sources are tracked separately so releasing one cannot
 * cut short a note held by the other.
 */
export function Button({ def }: WidgetProps) {
  const text = def.text ?? def.label ?? 'Button';
  const latch = def.mode === 'toggle' || def.mode === 'latch';
  const [value, setChannelValue] = useChannel(def.channel_name, 0);
  const [momentaryPressed, setMomentaryPressed] = useState(false);
  const held = useRef<Set<string>>(new Set());
  const color = typeof def.color === 'string' ? def.color : undefined;
  const textColor = typeof def.textColor === 'string' ? def.textColor : undefined;

  const press = useCallback(
    (source: string) => {
      if (held.current.has(source)) return;
      const wasIdle = held.current.size === 0;
      held.current.add(source);
      if (wasIdle) {
        setChannelValue(1);
        setMomentaryPressed(true);
      }
    },
    [setChannelValue],
  );

  const release = useCallback(
    (source: string) => {
      if (!held.current.delete(source)) return;
      if (held.current.size === 0) {
        setChannelValue(0);
        setMomentaryPressed(false);
      }
    },
    [setChannelValue],
  );

  // Never leave a momentary channel stuck at 1 if the widget disappears.
  useEffect(
    () => () => {
      if (held.current.size > 0) {
        held.current.clear();
        setChannelValue(0);
      }
    },
    [setChannelValue],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (latch || event.button !== 0) return;
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture is unavailable for synthetic events */
    }
    press(`p:${event.pointerId}`);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (latch) return;
    release(`p:${event.pointerId}`);
    try {
      (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    } catch {
      /* not captured */
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!ACTIVATION_KEYS.has(event.key)) return;
    event.preventDefault(); // also suppresses the native click for Space/Enter
    if (event.repeat) return;
    if (latch) setChannelValue(value > 0 ? 0 : 1);
    else press(`k:${event.key}`);
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (latch || !ACTIVATION_KEYS.has(event.key)) return;
    release(`k:${event.key}`);
  };

  const onClick = () => {
    if (latch) setChannelValue(value > 0 ? 0 : 1);
  };

  const onBlur = () => {
    if (latch) return;
    for (const source of [...held.current]) if (source.startsWith('k:')) release(source);
  };

  const pressed = latch ? value > 0 : momentaryPressed;

  return (
    <div className="cp-widget cp-widget--button" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      <button
        type="button"
        className={`cp-button${pressed ? ' is-pressed' : ''}`}
        style={{ backgroundColor: color, color: textColor }}
        aria-pressed={pressed}
        data-pressed={pressed ? 'true' : 'false'}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onClick={onClick}
        onBlur={onBlur}
      >
        {text}
      </button>
    </div>
  );
}
