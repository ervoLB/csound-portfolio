// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextMeter, cellZone } from '../../../player/widgets/text/TextMeter';
import { makeDef, renderWidget } from '../helpers';

const def = makeDef({ type: 'meter', channel_name: 'level', label: 'Level', min: 0, max: 1 });

function cellsOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.cp-cell'));
}

function filledCount(container: HTMLElement): number {
  return cellsOf(container).filter((cell) => cell.getAttribute('data-on') === 'true').length;
}

describe('TextMeter', () => {
  it('is a read-only meter with min, max and fallback values', () => {
    const { container, sent } = renderWidget(<TextMeter def={def} />);
    const meter = screen.getByRole('meter', { name: 'Level' });
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('1');
    expect(meter.getAttribute('aria-valuenow')).toBe('0');
    expect(meter.getAttribute('aria-valuetext')).toBe('0.00');
    expect(container.querySelector('.cp-tmeter__cells')).toBeTruthy();
    expect(cellsOf(container)).toHaveLength(16);
    expect(filledCount(container)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('reflects values published by the engine', () => {
    const { container, store } = renderWidget(<TextMeter def={def} />);
    act(() => store.publish({ level: 0.5 }));

    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('0.5');
    expect(meter.getAttribute('aria-valuetext')).toBe('0.50');
    expect(container.querySelector('.cp-widget__value')?.textContent).toBe('0.50');
    expect(filledCount(container)).toBe(8);
  });

  it('clamps published values to its range', () => {
    const { container, store } = renderWidget(<TextMeter def={def} />);

    act(() => store.publish({ level: 5 }));
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('1');
    expect(filledCount(container)).toBe(16);

    act(() => store.publish({ level: -3 }));
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('0');
    expect(filledCount(container)).toBe(0);
  });

  it('maps published values through the configured min/max', () => {
    const { container, store } = renderWidget(
      <TextMeter def={makeDef({ type: 'meter', channel_name: 'level', label: 'Level', min: 0, max: 10 })} />,
    );
    act(() => store.publish({ level: 5 }));
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('5');
    expect(filledCount(container)).toBe(8);
  });

  it('never sends input to the engine', () => {
    const { sent, store } = renderWidget(<TextMeter def={def} />);
    const meter = screen.getByRole('meter');

    fireEvent.keyDown(meter, { key: 'ArrowUp' });
    fireEvent.pointerDown(meter, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(meter, { pointerId: 1, clientX: 40, clientY: 10 });
    fireEvent.pointerUp(meter, { pointerId: 1 });
    fireEvent.doubleClick(meter);
    act(() => store.publish({ level: 0.75 }));

    expect(sent).toHaveLength(0);
    expect(store.snapshot()).toEqual({ level: 0.75 });
  });

  it('hides the value text when showValue is false', () => {
    const { container } = renderWidget(<TextMeter def={makeDef({ ...def, showValue: false })} />);
    expect(container.querySelector('.cp-widget__value')?.textContent).toBe('');
  });
});

describe('cellZone', () => {
  it('marks only the top cells as warn and the very top as danger', () => {
    expect(cellZone(0, 16)).toBeUndefined();
    expect(cellZone(12, 16)).toBeUndefined(); // 81.25%
    expect(cellZone(13, 16)).toBe('warn'); // 87.5%
    expect(cellZone(14, 16)).toBe('warn'); // 93.75%
    expect(cellZone(15, 16)).toBe('danger'); // 100%
  });

  it('uses strict thresholds above 85% and above 98%', () => {
    expect(cellZone(84, 100)).toBeUndefined(); // exactly 85%
    expect(cellZone(85, 100)).toBe('warn'); // 86%
    expect(cellZone(97, 100)).toBe('warn'); // exactly 98%
    expect(cellZone(98, 100)).toBe('danger'); // 99%
  });

  it('marks the rendered cells with their zones', () => {
    const { container } = renderWidget(<TextMeter def={def} />);
    const cells = cellsOf(container);
    expect(cells.at(-1)?.getAttribute('data-zone')).toBe('danger');
    expect(cells.at(-2)?.getAttribute('data-zone')).toBe('warn');
    expect(cells.at(-3)?.getAttribute('data-zone')).toBe('warn');
    expect(cells[0]?.getAttribute('data-zone')).toBeNull();
    expect(container.querySelectorAll('[data-zone="danger"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-zone="warn"]')).toHaveLength(2);
  });
});
