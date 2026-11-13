import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useChannel } from './runtime';
import { useDrag } from './useDrag';
import { clampToStep, formatWidgetValue, toFiniteNumber } from './valueMath';
import type { WidgetProps } from './types';

function axisRange(def: WidgetProps['def'], axis: 'X' | 'Y'): [number, number] {
  const baseMin = toFiniteNumber(def.min, 0);
  const baseMax = toFiniteNumber(def.max, 1);
  const min = def[`min${axis}`] !== undefined ? toFiniteNumber(def[`min${axis}`], baseMin) : baseMin;
  const max = def[`max${axis}`] !== undefined ? toFiniteNumber(def[`max${axis}`], baseMax) : baseMax;
  return [Math.min(min, max), Math.max(min, max)];
}

/** Two-channel absolute pad: pointer position maps directly to x/y, y up = max. */
export function XYPad({ def }: WidgetProps) {
  const [loX, hiX] = axisRange(def, 'X');
  const [loY, hiY] = axisRange(def, 'Y');
  const stepRaw = def.step !== undefined ? toFiniteNumber(def.step, NaN) : NaN;
  const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : undefined;
  const fallbackX = clampToStep(
    def.default_x !== undefined ? toFiniteNumber(def.default_x, loX) : loX,
    loX,
    hiX,
    step,
  );
  const fallbackY = clampToStep(
    def.default_y !== undefined ? toFiniteNumber(def.default_y, loY) : loY,
    loY,
    hiY,
    step,
  );
  const [x, setX] = useChannel(def.channel_x_name, fallbackX);
  const [y, setY] = useChannel(def.channel_y_name, fallbackY);

  const normX = Math.max(0, Math.min(1, (x - loX) / (hiX - loX || 1)));
  const normY = Math.max(0, Math.min(1, (y - loY) / (hiY - loY || 1)));

  const setFromPointer = (nx: number, ny: number) => {
    const cx = Math.max(0, Math.min(1, nx));
    const cy = Math.max(0, Math.min(1, 1 - ny)); // screen y grows downwards
    setX(clampToStep(loX + cx * (hiX - loX), loX, hiX, step));
    setY(clampToStep(loY + cy * (hiY - loY), loY, hiY, step));
  };

  const drag = useDrag({
    onStart: ({ x: px, y: py }) => setFromPointer(px, py),
    onMove: ({ x: px, y: py }) => setFromPointer(px, py),
  });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const factor = event.shiftKey ? 10 : 1;
    const incX = ((hiX - loX) / 100) * factor;
    const incY = ((hiY - loY) / 100) * factor;
    let nextX: number | null = null;
    let nextY: number | null = null;
    switch (event.key) {
      case 'ArrowRight': nextX = x + incX; break;
      case 'ArrowLeft': nextX = x - incX; break;
      case 'ArrowUp': nextY = y + incY; break;
      case 'ArrowDown': nextY = y - incY; break;
      default: return;
    }
    event.preventDefault();
    if (nextX !== null) setX(clampToStep(nextX, loX, hiX, step));
    if (nextY !== null) setY(clampToStep(nextY, loY, hiY, step));
  };

  const size = Math.max(100, Math.min(320, toFiniteNumber(def.width ?? def.height, 160)));
  const label = def.label ?? '';
  const displayX = formatWidgetValue(x, step);
  const displayY = formatWidgetValue(y, step);
  const handleColor = typeof def.handleColor === 'string' ? def.handleColor : undefined;
  const backgroundColor = typeof def.backgroundColor === 'string' ? def.backgroundColor : undefined;
  const channels = [def.channel_x_name, def.channel_y_name].filter((name): name is string => !!name);

  return (
    <div
      className="cp-widget cp-widget--xypad"
      title={channels.length ? `Channels: ${channels.join(', ')}` : undefined}
    >
      {label && <span className="cp-widget__label">{label}</span>}
      <div
        className="cp-xypad"
        style={{ width: `${size}px`, height: `${size}px`, backgroundColor }}
        role="slider"
        tabIndex={0}
        aria-label={`${label || 'XY pad'} X/Y`}
        aria-valuemin={loX}
        aria-valuemax={hiX}
        aria-valuenow={x}
        aria-valuetext={`x: ${x}, y: ${y}`}
        onKeyDown={onKeyDown}
        {...drag}
      >
        <span
          className="cp-xypad__handle"
          style={{
            left: `${normX * 100}%`,
            top: `${(1 - normY) * 100}%`,
            backgroundColor: handleColor,
          }}
        />
      </div>
      <span className="cp-widget__value">{`x: ${displayX}, y: ${displayY}`}</span>
    </div>
  );
}
