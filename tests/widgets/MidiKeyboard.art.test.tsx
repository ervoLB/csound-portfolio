// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MidiKeyboard } from '../../player/widgets/MidiKeyboard';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({ type: 'midi_keyboard', start_note: 60, end_note: 62, midi_channel: 2 });

function artPre(container: HTMLElement): HTMLPreElement | null {
  return container.querySelector<HTMLPreElement>('pre.cp-midi-art');
}

describe('MidiKeyboard character-art keyboard', () => {
  it('renders the drawing and the art modifier when art is set', () => {
    const { container } = renderWidget(<MidiKeyboard def={def} art />);

    const keyboard = container.querySelector('.cp-midi-keyboard');
    expect(keyboard?.classList.contains('cp-midi-keyboard--art')).toBe(true);

    const pre = artPre(container);
    expect(pre).toBeTruthy();
    expect(pre!.getAttribute('aria-hidden')).toBe('true');
    expect(pre!.textContent).toContain('┌');
    expect(pre!.textContent).toContain('C4');
  });

  it('renders no drawing without art', () => {
    const { container } = renderWidget(<MidiKeyboard def={def} />);

    expect(artPre(container)).toBeNull();
    expect(container.querySelector('.cp-midi-keyboard')?.classList.contains('cp-midi-keyboard--art')).toBe(false);
    expect(screen.getByRole('button', { name: 'C4' })).toBeTruthy();
  });

  it('marks a pressed key in the drawing and still sends Note On', () => {
    const { container, midi } = renderWidget(<MidiKeyboard def={def} art />);
    const pre = artPre(container)!;
    expect(pre.querySelector('b')).toBeNull();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'C4' }), { button: 0, pointerId: 1 });

    expect(midi.at(-1)).toEqual([0x91, 60, 100]);
    const runs = Array.from(pre.querySelectorAll('b'));
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((run) => run.textContent?.includes('░'))).toBe(true);
  });

  it('unmarks the key again on pointer up', () => {
    const { container, midi } = renderWidget(<MidiKeyboard def={def} art />);
    const pre = artPre(container)!;

    fireEvent.pointerDown(screen.getByRole('button', { name: 'C4' }), { button: 0, pointerId: 1 });
    expect(pre.querySelector('b')).toBeTruthy();

    fireEvent.pointerUp(screen.getByRole('button', { name: 'C4' }), { pointerId: 1 });
    expect(midi.at(-1)).toEqual([0x81, 60, 0]);
    expect(pre.querySelector('b')).toBeNull();
  });
});
