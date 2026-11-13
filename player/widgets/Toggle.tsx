import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useChannel } from './runtime';
import { toFiniteNumber } from './valueMath';
import type { WidgetProps } from './types';

const ACTIVATION_KEYS = new Set([' ', 'Enter', 'Spacebar']);

/** Same 0/1 channel as Checkbox, rendered as a switch. */
export function Toggle({ def }: WidgetProps) {
  const label = def.label ?? '';
  const fallback = toFiniteNumber(def.default, 0) > 0 ? 1 : 0;
  const [value, setValue] = useChannel(def.channel_name, fallback);
  const checked = value > 0;
  const activeColor = typeof def.activeColor === 'string' ? def.activeColor : undefined;
  const inactiveColor = typeof def.inactiveColor === 'string' ? def.inactiveColor : undefined;

  const toggle = () => setValue(checked ? 0 : 1);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!ACTIVATION_KEYS.has(event.key)) return;
    event.preventDefault(); // suppress the native click so we toggle exactly once
    if (event.repeat) return;
    toggle();
  };

  return (
    <div className="cp-widget cp-widget--toggle" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      <button
        type="button"
        role="switch"
        className="cp-toggle"
        aria-checked={checked}
        aria-label={label || def.channel_name || 'Toggle'}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span
          className="cp-toggle__track"
          style={{
            backgroundColor: checked ? activeColor : inactiveColor,
            borderColor: checked ? activeColor : inactiveColor,
          }}
        >
          <span className="cp-toggle__knob" />
        </span>
        {label && <span className="cp-widget__label cp-toggle__text">{label}</span>}
      </button>
    </div>
  );
}
