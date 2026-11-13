// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Knob } from '../../player/widgets/Knob';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({ type: 'knob', channel_name: 'cutoff', label: 'Cutoff', min: 20, max: 20000, default: 1000, step: 1, scale: 'logarithmic' });

describe('Knob', () => {
  it('shows label, default value and slider semantics', () => {
    renderWidget(<Knob def={def} />);
    const knob = screen.getByRole('slider', { name: 'Cutoff' });
    expect(knob.getAttribute('aria-valuenow')).toBe('1000');
    expect(knob.getAttribute('aria-valuemin')).toBe('20');
    expect(screen.getByText('1000')).toBeTruthy();
  });

  it('shows the current channel value from the store', () => {
    renderWidget(<Knob def={def} />, { cutoff: 440 });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('440');
  });

  it('sends keyboard changes to the channel', () => {
    const { sent } = renderWidget(<Knob def={def} />);
    const knob = screen.getByRole('slider');
    fireEvent.keyDown(knob, { key: 'ArrowUp' });
    expect(sent.at(-1)).toEqual(['cutoff', 1001]);
    fireEvent.keyDown(knob, { key: 'End' });
    expect(sent.at(-1)).toEqual(['cutoff', 20000]);
    fireEvent.keyDown(knob, { key: 'Home' });
    expect(sent.at(-1)).toEqual(['cutoff', 20]);
  });

  it('drags up to increase, logarithmically, and double-click resets', () => {
    const { sent } = renderWidget(<Knob def={def} />);
    const knob = screen.getByRole('slider');
    fireEvent.pointerDown(knob, { button: 0, clientX: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(knob, { clientX: 0, clientY: 70, pointerId: 1 }); // 30 px up = 15% of the sweep
    fireEvent.pointerUp(knob, { pointerId: 1 });
    const value = sent.at(-1)![1];
    // log scale: 1000 Hz sits at 56.6% of 20..20000; +15% → 20 * 1000^0.716 ≈ 2800 Hz
    expect(value).toBeGreaterThan(2500);
    expect(value).toBeLessThan(3100);
    fireEvent.doubleClick(knob);
    expect(sent.at(-1)).toEqual(['cutoff', 1000]);
  });

  it('follows values published by the engine', () => {
    const { store } = renderWidget(<Knob def={def} />);
    act(() => store.publish({ cutoff: 5000 }));
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('5000');
  });
});

describe('Knob without a channel', () => {
  it('still responds locally and sends nothing to the engine', () => {
    const { sent } = renderWidget(<Knob def={makeDef({ type: 'knob', label: 'Free', min: 0, max: 10, default: 5, step: 1 })} />);
    const knob = screen.getByRole('slider', { name: 'Free' });
    fireEvent.keyDown(knob, { key: 'ArrowUp' });
    expect(knob.getAttribute('aria-valuenow')).toBe('6');
    expect(sent).toEqual([]);
  });
});
