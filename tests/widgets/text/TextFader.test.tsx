// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FADER_CELLS, TextFader, filledCells } from '../../../player/widgets/text/TextFader';
import { makeDef, renderWidget } from '../helpers';

const logDef = makeDef({
  type: 'knob',
  channel_name: 'cutoff',
  label: 'Cutoff',
  min: 20,
  max: 20000,
  default: 1000,
  step: 1,
  scale: 'logarithmic',
});

const linearDef = makeDef({
  type: 'slider',
  channel_name: 'gain',
  label: 'Gain',
  min: 0,
  max: 10,
  default: 2,
  step: 1,
});

function cellsOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.cp-cell'));
}

function filledCount(container: HTMLElement): number {
  return cellsOf(container).filter((cell) => cell.getAttribute('data-on') === 'true').length;
}

describe('TextFader', () => {
  it('exposes slider semantics, a label and the formatted value', () => {
    const { container } = renderWidget(<TextFader def={logDef} />);
    const fader = screen.getByRole('slider', { name: 'Cutoff' });
    expect(fader.getAttribute('aria-valuemin')).toBe('20');
    expect(fader.getAttribute('aria-valuemax')).toBe('20000');
    expect(fader.getAttribute('aria-valuenow')).toBe('1000');
    expect(fader.getAttribute('aria-valuetext')).toBe('1000');
    expect(fader.getAttribute('aria-orientation')).toBe('horizontal');
    expect(screen.getByText('Cutoff')).toBeTruthy();
    expect(container.querySelector('.cp-tfader__value')?.textContent).toBe('1000');
  });

  it('renders 16 cells by default and fills them from the normalised value', () => {
    const { container } = renderWidget(<TextFader def={logDef} />);
    expect(FADER_CELLS).toBe(16);
    expect(cellsOf(container)).toHaveLength(16);
    // 1000 Hz is log(50)/log(1000) = 56.6% of 20..20000 → round(9.06) cells.
    expect(filledCount(container)).toBe(9);
  });

  it('fills no cell at the minimum and every cell at the maximum', () => {
    const low = renderWidget(<TextFader def={logDef} />, { cutoff: 20 });
    expect(filledCount(low.container)).toBe(0);

    const high = renderWidget(<TextFader def={logDef} />, { cutoff: 20000 });
    expect(filledCount(high.container)).toBe(16);
  });

  it('fills cells logarithmically for a log-scale definition', () => {
    // 2000 Hz is exactly 2/3 of the logarithmic 20..20000 sweep → round(10.67) cells.
    const { container } = renderWidget(<TextFader def={logDef} />, { cutoff: 2000 });
    expect(filledCount(container)).toBe(11);
  });

  it('fills cells linearly for a linear definition', () => {
    // 2 of 0..10 is 20% → round(3.2) = 3 cells.
    const { container } = renderWidget(<TextFader def={linearDef} />);
    expect(filledCount(container)).toBe(3);
  });

  it('changes the value through the channel with the keyboard', () => {
    const { sent } = renderWidget(<TextFader def={logDef} />);
    const fader = screen.getByRole('slider');

    fireEvent.keyDown(fader, { key: 'ArrowUp' });
    expect(sent.at(-1)).toEqual(['cutoff', 1001]);

    fireEvent.keyDown(fader, { key: 'ArrowRight' });
    expect(sent.at(-1)).toEqual(['cutoff', 1002]);

    fireEvent.keyDown(fader, { key: 'ArrowDown' });
    expect(sent.at(-1)).toEqual(['cutoff', 1001]);

    fireEvent.keyDown(fader, { key: 'ArrowLeft' });
    expect(sent.at(-1)).toEqual(['cutoff', 1000]);

    fireEvent.keyDown(fader, { key: 'PageUp' });
    expect(sent.at(-1)).toEqual(['cutoff', 1010]);

    fireEvent.keyDown(fader, { key: 'PageDown' });
    expect(sent.at(-1)).toEqual(['cutoff', 1000]);

    fireEvent.keyDown(fader, { key: 'ArrowUp', shiftKey: true });
    expect(sent.at(-1)).toEqual(['cutoff', 1010]);
  });

  it('jumps to the ends with Home and End', () => {
    const { sent } = renderWidget(<TextFader def={logDef} />);
    const fader = screen.getByRole('slider');

    fireEvent.keyDown(fader, { key: 'End' });
    expect(sent.at(-1)).toEqual(['cutoff', 20000]);

    fireEvent.keyDown(fader, { key: 'Home' });
    expect(sent.at(-1)).toEqual(['cutoff', 20]);
  });

  it('resets to the default on double-click', () => {
    const { sent } = renderWidget(<TextFader def={logDef} />, { cutoff: 5000 });
    const fader = screen.getByRole('slider');
    expect(fader.getAttribute('aria-valuenow')).toBe('5000');

    fireEvent.doubleClick(fader);
    expect(sent.at(-1)).toEqual(['cutoff', 1000]);
    expect(fader.getAttribute('aria-valuenow')).toBe('1000');
  });

  it('drags relatively without jumping on pointer-down (zero-sized rect in jsdom)', () => {
    const { sent } = renderWidget(<TextFader def={logDef} />);
    const fader = screen.getByRole('slider');

    fireEvent.pointerDown(fader, { button: 0, pointerId: 1, clientX: 500, clientY: 100 });
    expect(sent).toHaveLength(0);

    fireEvent.pointerMove(fader, { pointerId: 1, clientX: 520, clientY: 100 });
    const [, moved] = sent.at(-1)!;
    expect(moved).toBeGreaterThan(1000);
    expect(moved).toBeLessThan(20000);

    fireEvent.pointerUp(fader, { pointerId: 1 });
    const count = sent.length;
    fireEvent.pointerMove(fader, { pointerId: 1, clientX: 560, clientY: 100 });
    expect(sent).toHaveLength(count);
  });

  it('uses Shift for finer dragging', () => {
    const normalRun = renderWidget(<TextFader def={logDef} />);
    const normalFader = normalRun.container.querySelector('[role="slider"]') as HTMLElement;
    fireEvent.pointerDown(normalFader, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(normalFader, { pointerId: 1, clientX: 20, clientY: 0 });
    const normal = normalRun.sent.at(-1)![1];
    fireEvent.pointerUp(normalFader, { pointerId: 1 });

    const fineRun = renderWidget(<TextFader def={logDef} />);
    const fineFader = fineRun.container.querySelector('[role="slider"]') as HTMLElement;
    fireEvent.pointerDown(fineFader, { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(fineFader, { pointerId: 2, clientX: 20, clientY: 0, shiftKey: true });
    const fine = fineRun.sent.at(-1)![1];
    fireEvent.pointerUp(fineFader, { pointerId: 2 });

    expect(fine).toBeGreaterThan(1000);
    expect(fine).toBeLessThan(normal);
    // 20 px is a tenth of the full sweep normally and a hundredth with Shift.
    expect(normal - 1000).toBeGreaterThan((fine - 1000) * 5);
  });

  it('clamps def.cells to 6..32', () => {
    const small = renderWidget(<TextFader def={makeDef({ type: 'knob', cells: 2 })} />);
    expect(cellsOf(small.container)).toHaveLength(6);

    const large = renderWidget(<TextFader def={makeDef({ type: 'knob', cells: 200 })} />);
    expect(cellsOf(large.container)).toHaveLength(32);
  });

  it('hides the value text when showValue is false', () => {
    const { container } = renderWidget(<TextFader def={makeDef({ ...logDef, showValue: false })} />);
    expect(container.querySelector('.cp-tfader__value')?.textContent).toBe('');
    expect(screen.queryByText('1000')).toBeNull();
  });
});

describe('filledCells', () => {
  it('returns no cells for zero, negative and non-finite values', () => {
    expect(filledCells(0)).toBe(0);
    expect(filledCells(-0.5)).toBe(0);
    expect(filledCells(Number.NaN)).toBe(0);
    expect(filledCells(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('fills at least one cell for any tiny positive value', () => {
    expect(filledCells(0.0001)).toBe(1);
    expect(filledCells(Number.EPSILON)).toBe(1);
  });

  it('fills every cell at 1 and clamps values above it', () => {
    expect(filledCells(1)).toBe(FADER_CELLS);
    expect(filledCells(1, 8)).toBe(8);
    expect(filledCells(2, 8)).toBe(8);
  });

  it('rounds to the nearest cell count', () => {
    expect(filledCells(0.5, 8)).toBe(4);
    expect(filledCells(0.2, 10)).toBe(2);
    expect(filledCells(0.24, 10)).toBe(2);
    expect(filledCells(0.26, 10)).toBe(3);
  });
});
