import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * A typed decimal number: optional sign, digits with one "." or "," as the decimal
 * mark, optional exponent ("1500", " 0,25 ", "-3e2", ".5"). Anything else → null
 * ("1,234,5", "0x10", "Infinity", "abc").
 */
export function parseTypedValue(text: string): number | null {
  const cleaned = text.trim();
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** The exact value for the field (not the rounded display), without float noise. */
export function editText(value: number): string {
  return String(Number(value.toPrecision(12)));
}

export interface EditableValueProps {
  /** Formatted value shown when not editing. */
  display: string;
  /** The exact value the field starts with. */
  value: number;
  editing: boolean;
  /** Ask to start editing (double-click). */
  onStart: () => void;
  /** Called with the typed number (already parsed), or null when cancelled or invalid. */
  onDone: (value: number | null, how: 'enter' | 'escape' | 'blur') => void;
  /** Name of the control, for the field's accessible name ("Cutoff value"). */
  label: string;
  className?: string;
  hidden?: boolean;
}

/**
 * A widget's value text that turns into a small field on double-click, so an exact
 * number can be typed. Enter applies, Escape cancels, leaving the field applies.
 */
export function EditableValue({ display, value, editing, onStart, onDone, label, className = 'cp-widget__value', hidden = false }: EditableValueProps) {
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!editing) return;
    finished.current = false;
    setInvalid(false);
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  if (!editing) {
    if (hidden) return null;
    return (
      <span className={`${className} cp-value`} title="Double-click to type a value" onDoubleClick={onStart}>
        {display}
      </span>
    );
  }

  const finish = (how: 'enter' | 'escape' | 'blur') => {
    if (finished.current) return;
    finished.current = true;
    onDone(how === 'escape' ? null : parseTypedValue(input.current?.value ?? ''), how);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      // Not a number: keep the field open and say so, rather than silently closing.
      if (parseTypedValue(input.current?.value ?? '') === null) {
        setInvalid(true);
        input.current?.select();
        return;
      }
      finish('enter');
    } else if (event.key === 'Escape') {
      // Cancel only; the player must not also stop the sound.
      event.preventDefault();
      event.stopPropagation();
      finish('escape');
    }
  };

  return (
    <input
      ref={input}
      className={`${className} cp-value-input`}
      type="text"
      inputMode="decimal"
      defaultValue={editText(value)}
      aria-label={`${label || 'Control'} value`}
      aria-invalid={invalid || undefined}
      title={invalid ? 'Type a number (Enter applies, Escape cancels)' : 'Enter applies, Escape cancels'}
      onKeyDown={onKeyDown}
      onInput={() => invalid && setInvalid(false)}
      onBlur={() => finish('blur')}
    />
  );
}
