import { useDrag } from './useDrag';
import { useContinuousValue } from './useContinuousValue';
import { EditableValue } from './EditableValue';
import type { WidgetProps } from './types';

/** Arc from 225° (min) clockwise to -45° (max), like a hardware pot. */
const START_ANGLE = 135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

/**
 * Rotary control. Drag up/down (or left/right), Shift for fine control,
 * arrow keys / PageUp / PageDown / Home / End, double-click to reset.
 */
export function Knob({ def }: WidgetProps) {
  const v = useContinuousValue(def);
  const drag = useDrag({
    onStart: v.beginDrag,
    onMove: ({ dx, dy, fine }) => v.dragBy(Math.abs(dy) >= Math.abs(dx) ? dy : dx, fine),
    onEnd: v.endDrag,
  });
  const size = typeof def.width === 'number' ? Math.max(36, Math.min(96, def.width)) : 56;
  const angle = START_ANGLE + v.norm * SWEEP;
  const pointerEnd = polar(50, 50, 30, angle);
  const pointerStart = polar(50, 50, 14, angle);
  const label = def.label ?? def.channel_name ?? '';
  const showValue = def.showValue !== false;
  const arcColor = typeof def.arcColor === 'string' ? def.arcColor : undefined;
  const knobColor = typeof def.knobColor === 'string' ? def.knobColor : undefined;

  return (
    <div className="cp-widget cp-widget--knob" title={def.channel_name ? `Channel: ${def.channel_name}` : undefined}>
      {label && <span className="cp-widget__label">{label}</span>}
      <svg
        ref={v.controlRef}
        className="cp-knob"
        viewBox="0 0 100 100"
        style={{ ['--cp-knob-size' as string]: `${size}px` }}
        role="slider"
        tabIndex={0}
        aria-label={label || 'Knob'}
        aria-valuemin={v.min}
        aria-valuemax={v.max}
        aria-valuenow={v.value}
        aria-valuetext={v.display}
        aria-keyshortcuts="Enter"
        onKeyDown={v.onKeyDown}
        onDoubleClick={v.reset}
        {...drag}
      >
        <circle className="cp-knob__body" cx="50" cy="50" r="33" strokeWidth="1.5" style={knobColor ? { fill: knobColor } : undefined} />
        <path className="cp-knob__track" d={arcPath(50, 50, 43, START_ANGLE, START_ANGLE + SWEEP)} strokeWidth="7" />
        {v.norm > 0.001 && (
          <path
            className="cp-knob__arc"
            d={arcPath(50, 50, 43, START_ANGLE, angle)}
            strokeWidth="7"
            style={arcColor ? { stroke: arcColor } : undefined}
          />
        )}
        <line
          className="cp-knob__pointer"
          x1={pointerStart.x}
          y1={pointerStart.y}
          x2={pointerEnd.x}
          y2={pointerEnd.y}
          strokeWidth="5"
        />
      </svg>
      <EditableValue display={v.display} value={v.value} editing={v.editing} onStart={v.startEdit} onDone={v.finishEdit} label={label} hidden={!showValue} />
    </div>
  );
}
