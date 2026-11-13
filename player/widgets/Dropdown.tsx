import { useChannel } from './runtime';
import { toFiniteNumber } from './valueMath';
import type { DropdownOption } from '../meta/types';
import type { WidgetProps } from './types';

function parseOptions(raw: unknown): DropdownOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((option): option is DropdownOption => {
      if (!option || typeof option !== 'object') return false;
      return Number.isFinite(Number((option as Partial<DropdownOption>).value));
    })
    .map((option) => ({ label: String(option.label ?? ''), value: Number(option.value) }));
}

/** Native <select>: the channel always receives the numeric option value. */
export function Dropdown({ def }: WidgetProps) {
  const options = parseOptions(def.options);
  const first = options[0]?.value ?? 0;
  const rawDefault = toFiniteNumber(def.default, NaN);
  // A `default` that is not one of the options cannot be shown by a select;
  // fall back to the first option in that case.
  const fallback = options.some((option) => option.value === rawDefault) ? rawDefault : first;
  const [channelValue, setValue] = useChannel(def.channel_name, fallback);
  const selected = options.some((option) => option.value === channelValue) ? channelValue : fallback;
  const label = def.label ?? '';

  return (
    <div className="cp-widget cp-widget--dropdown" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      {label && <span className="cp-widget__label">{label}</span>}
      <select
        className="cp-dropdown"
        value={options.length ? String(selected) : ''}
        disabled={options.length === 0}
        aria-label={label || def.channel_name || 'Dropdown'}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) setValue(value);
        }}
      >
        {options.map((option, index) => (
          <option key={`${option.value}-${index}`} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
