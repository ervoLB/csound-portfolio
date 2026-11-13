import { useChannel } from './runtime';
import { toFiniteNumber } from './valueMath';
import type { WidgetProps } from './types';

/** Native checkbox with a custom look. Values are always sent as 0 or 1. */
export function Checkbox({ def }: WidgetProps) {
  const label = def.label ?? '';
  const fallback = toFiniteNumber(def.default, 0) > 0 ? 1 : 0;
  const [value, setValue] = useChannel(def.channel_name, fallback);
  const checked = value > 0;
  const color = typeof def.color === 'string' ? def.color : undefined;
  const boxStyle = color
    ? checked
      ? { backgroundColor: color, borderColor: color }
      : { borderColor: color }
    : undefined;

  return (
    <div className="cp-widget cp-widget--checkbox" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      <label className="cp-checkbox">
        <input
          className="cp-checkbox__input"
          type="checkbox"
          checked={checked}
          onChange={(event) => setValue(event.target.checked ? 1 : 0)}
          aria-label={label || def.channel_name || 'Checkbox'}
        />
        <span className="cp-checkbox__box" style={boxStyle} aria-hidden="true" />
        {label && <span className="cp-widget__label cp-checkbox__text">{label}</span>}
      </label>
    </div>
  );
}
