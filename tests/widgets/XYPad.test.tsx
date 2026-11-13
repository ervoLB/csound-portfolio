// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { XYPad } from '../../player/widgets/XYPad';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({
  type: 'xypad',
  channel_x_name: 'x',
  channel_y_name: 'y',
  label: 'Pad',
  minX: 0,
  maxX: 10,
  minY: 0,
  maxY: 20,
  default_x: 2,
  default_y: 5,
});

function stubRect(element: Element, size = 100) {
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: size,
      height: size,
      right: size,
      bottom: size,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('XYPad', () => {
  it('shows defaults, both values and slider semantics', () => {
    const { container } = renderWidget(<XYPad def={def} />);
    const pad = screen.getByRole('slider', { name: 'Pad X/Y' });
    expect(pad.getAttribute('aria-valuemin')).toBe('0');
    expect(pad.getAttribute('aria-valuemax')).toBe('10');
    expect(pad.getAttribute('aria-valuenow')).toBe('2');
    expect(pad.getAttribute('aria-valuetext')).toBe('x: 2, y: 5');
    expect(container.querySelector('.cp-widget__value')?.textContent).toBe('x: 2.00, y: 5.00');
    expect(container.querySelector('.cp-widget--xypad')?.getAttribute('title')).toBe('Channels: x, y');
  });

  it('sets both axes from an absolute pointer position (y up = max)', () => {
    const { sent } = renderWidget(<XYPad def={def} />);
    const pad = screen.getByRole('slider', { name: 'Pad X/Y' });
    stubRect(pad);
    fireEvent.pointerDown(pad, { button: 0, pointerId: 1, clientX: 25, clientY: 75 });
    expect(sent).toEqual([
      ['x', 2.5],
      ['y', 5],
    ]);
    fireEvent.pointerUp(pad, { pointerId: 1 });
  });

  it('keeps mapping absolutely while dragging', () => {
    const { sent } = renderWidget(<XYPad def={def} />);
    const pad = screen.getByRole('slider', { name: 'Pad X/Y' });
    stubRect(pad);
    fireEvent.pointerDown(pad, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 80, clientY: 20 });
    expect(sent.slice(-2)).toEqual([
      ['x', 8],
      ['y', 16],
    ]);
    fireEvent.pointerUp(pad, { pointerId: 1 });
  });

  it('moves 1% of the range with arrows and 10% with Shift', () => {
    const { sent } = renderWidget(<XYPad def={def} />);
    const pad = screen.getByRole('slider', { name: 'Pad X/Y' });
    fireEvent.keyDown(pad, { key: 'ArrowRight' });
    expect(sent.at(-1)![1]).toBeCloseTo(2.1);
    fireEvent.keyDown(pad, { key: 'ArrowUp' });
    expect(sent.at(-1)![1]).toBeCloseTo(5.2);
    fireEvent.keyDown(pad, { key: 'ArrowLeft', shiftKey: true });
    expect(sent.at(-1)![1]).toBeCloseTo(1.1);
  });

  it('follows engine-published values', () => {
    const { store } = renderWidget(<XYPad def={def} />);
    act(() => store.publish({ x: 7, y: 9 }));
    const pad = screen.getByRole('slider');
    expect(pad.getAttribute('aria-valuenow')).toBe('7');
    expect(pad.getAttribute('aria-valuetext')).toBe('x: 7, y: 9');
  });

  it('falls back to min/max and clamps the size', () => {
    const { container } = renderWidget(
      <XYPad
        def={makeDef({
          type: 'xypad',
          channel_x_name: 'x',
          channel_y_name: 'y',
          min: -1,
          max: 1,
          width: 900,
        })}
      />,
    );
    const pad = screen.getByRole('slider');
    expect(pad.getAttribute('aria-valuemin')).toBe('-1');
    expect(pad.getAttribute('aria-valuemax')).toBe('1');
    expect((pad as HTMLElement).style.width).toBe('320px');
    stubRect(pad);
    fireEvent.pointerDown(pad, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(pad, { pointerId: 1 });
    expect(container.querySelector('.cp-widget__value')?.textContent).toBe('x: 0.00, y: 0.00');
  });

  it('handles min > max and no channel without crashing', () => {
    const { sent } = renderWidget(
      <XYPad def={makeDef({ type: 'xypad', minX: 10, maxX: 0, minY: 20, maxY: 0 })} />,
    );
    const pad = screen.getByRole('slider');
    expect(pad.getAttribute('aria-valuemin')).toBe('0');
    expect(pad.getAttribute('aria-valuemax')).toBe('10');
    stubRect(pad);
    expect(() =>
      fireEvent.pointerDown(pad, { button: 0, pointerId: 1, clientX: 50, clientY: 50 }),
    ).not.toThrow();
    expect(sent).toHaveLength(0);
  });

  it('applies colour overrides', () => {
    const { container } = renderWidget(
      <XYPad def={makeDef({ type: 'xypad', handleColor: 'red', backgroundColor: 'blue' })} />,
    );
    const pad = container.querySelector('.cp-xypad') as HTMLElement;
    expect(pad.style.backgroundColor).toBe('blue');
    expect((container.querySelector('.cp-xypad__handle') as HTMLElement).style.backgroundColor).toBe('red');
  });
});
