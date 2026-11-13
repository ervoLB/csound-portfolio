import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useChannel } from './runtime';
import { formatWidgetValue, toFiniteNumber } from './valueMath';
import type { WidgetProps } from './types';

/** How often a live label redraws: fast enough to follow, slow enough to read. */
export const LABEL_REFRESH_MS = 100;

/** The number as a label shows it: `decimals` places, or the usual widget rounding. */
export function formatLabelValue(value: number, decimals?: number): string {
  const n = toFiniteNumber(value, 0);
  if (decimals !== undefined && Number.isFinite(decimals)) return n.toFixed(Math.max(0, Math.min(10, Math.round(decimals))));
  return formatWidgetValue(n);
}

/** `value` at most every `ms` milliseconds; the latest value always arrives. */
function useThrottled(value: number, ms: number): number {
  const [shown, setShown] = useState(value);
  const latest = useRef(value);
  const last = useRef(0);
  latest.current = value;
  useEffect(() => {
    if (Object.is(value, shown)) return;
    const wait = Math.max(0, last.current + ms - Date.now());
    const timer = setTimeout(() => {
      last.current = Date.now();
      setShown(latest.current);
    }, wait);
    return () => clearTimeout(timer);
  }, [value, shown, ms]);
  return shown;
}

/**
 * Text on the board. The text is a React text node, so it can never inject HTML.
 *
 * Bound to a channel (on a `chnset` line, or with `channel:`), the label shows the
 * channel's value: `text: "RMS: {value}"` puts it into the text; otherwise the
 * number appears under the text (or the label) as a caption.
 */
export function Label({ def }: WidgetProps) {
  // Centred by default (in CSS, so a text board can align labels with its rows).
  const align = def.align === 'left' || def.align === 'right' || def.align === 'center' ? def.align : undefined;
  const fontSize =
    def.fontSize === undefined ? undefined : Math.max(8, Math.min(72, toFiniteNumber(def.fontSize, 14)));
  const fontWeight =
    typeof def.fontWeight === 'number' || typeof def.fontWeight === 'string' ? def.fontWeight : undefined;
  const color = typeof def.color === 'string' ? def.color : undefined;

  const style: CSSProperties = {
    textAlign: align,
    fontSize: fontSize === undefined ? undefined : `${fontSize}px`,
    fontWeight,
    color,
  };

  if (def.channel_name) return <LiveLabel def={def} style={style} />;

  return (
    <div className="cp-widget cp-widget--label">
      <span className="cp-label" style={style}>
        {def.text ?? def.label ?? ''}
      </span>
    </div>
  );
}

function LiveLabel({ def, style }: WidgetProps & { style: CSSProperties }) {
  const [published] = useChannel(def.channel_name, def.default);
  const value = useThrottled(toFiniteNumber(published, def.default), LABEL_REFRESH_MS);
  const number = formatLabelValue(value, def.decimals);
  const template = typeof def.text === 'string' && def.text.includes('{value}') ? def.text : undefined;

  if (template) {
    return (
      <div className="cp-widget cp-widget--label cp-widget--live" title={`Channel: ${def.channel_name}`}>
        <span className="cp-label cp-label--live" style={style}>
          {template.split('{value}').join(number)}
        </span>
      </div>
    );
  }
  const caption = def.text ?? def.label ?? '';
  return (
    <div className="cp-widget cp-widget--label cp-widget--live" title={`Channel: ${def.channel_name}`}>
      {caption && <span className="cp-widget__label">{caption}</span>}
      <span className="cp-label cp-label--live" style={style}>
        {number}
      </span>
    </div>
  );
}
