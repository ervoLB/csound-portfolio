import { useChannel } from './runtime';
import { formatWidgetValue, toFiniteNumber } from './valueMath';
import type { WidgetProps } from './types';

/** Read-only level meter: values arrive from the engine through store.publish(). */
export function Meter({ def }: WidgetProps) {
  const rawMin = toFiniteNumber(def.min, 0);
  const rawMax = toFiniteNumber(def.max, 1);
  const lo = Math.min(rawMin, rawMax);
  const hi = Math.max(rawMin, rawMax);
  const step = def.step !== undefined ? toFiniteNumber(def.step, NaN) : NaN;
  const validStep = Number.isFinite(step) && step > 0 ? step : undefined;

  // A meter only reads: it ignores the setter returned by useChannel.
  const [published] = useChannel(def.channel_name, lo);
  const value = Math.max(lo, Math.min(hi, toFiniteNumber(published, lo)));
  const fraction = Math.max(0, Math.min(1, (value - lo) / (hi - lo || 1)));
  const zone = fraction > 0.98 ? 'danger' : fraction > 0.85 ? 'warn' : 'accent';
  const horizontal = def.orientation === 'horizontal';
  const label = def.label ?? '';
  const showValue = def.showValue !== false;
  const fillColor = typeof def.fillColor === 'string' ? def.fillColor : undefined;
  const fillStyle = horizontal
    ? { width: `${fraction * 100}%`, backgroundColor: fillColor }
    : { height: `${fraction * 100}%`, backgroundColor: fillColor };

  return (
    <div className="cp-widget cp-widget--meter" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      {label && <span className="cp-widget__label">{label}</span>}
      <div
        className={`cp-meter cp-meter--${horizontal ? 'horizontal' : 'vertical'}`}
        role="meter"
        aria-label={label || def.channel_name || 'Meter'}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={value}
        aria-valuetext={formatWidgetValue(value, validStep)}
      >
        <div className="cp-meter__bar">
          <div className="cp-meter__fill" data-zone={zone} style={fillStyle} />
        </div>
      </div>
      {showValue && <span className="cp-widget__value">{formatWidgetValue(value, validStep)}</span>}
    </div>
  );
}
