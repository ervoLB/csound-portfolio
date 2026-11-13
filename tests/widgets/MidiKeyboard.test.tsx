// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MidiKeyboard } from '../../player/widgets/MidiKeyboard';
import { makeDef, renderWidget } from './helpers';

const def = makeDef({ type: 'midi_keyboard', start_note: 60, end_note: 62, midi_channel: 2 });

describe('MidiKeyboard', () => {
  it('renders inclusive piano keys with note names on C keys', () => {
    const { container } = renderWidget(<MidiKeyboard def={def} />);
    expect(screen.getByRole('button', { name: 'C4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'C#4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'D4' })).toBeTruthy();
    expect(screen.getByText('C4')).toBeTruthy();
    expect(screen.queryByText('D4')).toBeNull(); // only C keys are labelled
    expect(container.querySelectorAll('.cp-midi-key--white')).toHaveLength(2);
    expect(container.querySelectorAll('.cp-midi-key--black')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'MIDI keyboard' })).toBeTruthy();
  });

  it('sends Note On / Note Off on the configured MIDI channel', () => {
    const { midi } = renderWidget(<MidiKeyboard def={def} />);
    const key = screen.getByRole('button', { name: 'C4' });
    fireEvent.pointerDown(key, { button: 0, pointerId: 1 });
    expect(midi.at(-1)).toEqual([0x91, 60, 100]);
    expect(key.getAttribute('data-active')).toBe('true');
    fireEvent.pointerUp(key, { pointerId: 1 });
    expect(midi.at(-1)).toEqual([0x81, 60, 0]);
    expect(key.getAttribute('data-active')).toBe('false');
  });

  it('defaults to MIDI channel 1', () => {
    const { midi } = renderWidget(
      <MidiKeyboard def={makeDef({ type: 'midi_keyboard', start_note: 60, end_note: 60 })} />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'C4' }), { button: 0, pointerId: 1 });
    expect(midi.at(-1)).toEqual([0x90, 60, 100]);
  });

  it('clamps an out-of-range MIDI channel to 16', () => {
    const { midi } = renderWidget(
      <MidiKeyboard def={makeDef({ type: 'midi_keyboard', start_note: 60, end_note: 60, midi_channel: 99 })} />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'C4' }), { button: 0, pointerId: 1 });
    expect(midi.at(-1)).toEqual([0x9f, 60, 100]);
  });

  it('releases the old note and plays the new one when sliding (glissando)', () => {
    const { midi } = renderWidget(<MidiKeyboard def={def} />);
    const c = screen.getByRole('button', { name: 'C4' });
    const d = screen.getByRole('button', { name: 'D4' });
    fireEvent.pointerDown(c, { button: 0, pointerId: 1 });
    fireEvent.pointerMove(d, { pointerId: 1 });
    expect(midi).toEqual([
      [0x91, 60, 100],
      [0x81, 60, 0],
      [0x91, 62, 100],
    ]);
    fireEvent.pointerUp(d, { pointerId: 1 });
    expect(midi.at(-1)).toEqual([0x81, 62, 0]);
  });

  it('supports several simultaneous pointers', () => {
    const { midi } = renderWidget(<MidiKeyboard def={def} />);
    const c = screen.getByRole('button', { name: 'C4' });
    const d = screen.getByRole('button', { name: 'D4' });
    fireEvent.pointerDown(c, { button: 0, pointerId: 1 });
    fireEvent.pointerDown(d, { button: 0, pointerId: 2 });
    expect(midi).toEqual([
      [0x91, 60, 100],
      [0x91, 62, 100],
    ]);
    expect(c.getAttribute('data-active')).toBe('true');
    expect(d.getAttribute('data-active')).toBe('true');
    fireEvent.pointerUp(c, { pointerId: 1 });
    expect(midi.at(-1)).toEqual([0x81, 60, 0]);
    expect(d.getAttribute('data-active')).toBe('true');
    fireEvent.pointerUp(d, { pointerId: 2 });
    expect(midi.at(-1)).toEqual([0x81, 62, 0]);
  });

  it('releases on pointercancel / lostpointercapture', () => {
    const { midi, unmount } = renderWidget(<MidiKeyboard def={def} />);
    const key = screen.getByRole('button', { name: 'C4' });
    fireEvent.pointerDown(key, { button: 0, pointerId: 1 });
    fireEvent.pointerCancel(key, { pointerId: 1 });
    expect(midi.at(-1)).toEqual([0x81, 60, 0]);
    unmount();
    const second = renderWidget(<MidiKeyboard def={def} />);
    const key2 = screen.getByRole('button', { name: 'C4' });
    fireEvent.pointerDown(key2, { button: 0, pointerId: 2 });
    fireEvent.lostPointerCapture(key2, { pointerId: 2 });
    expect(second.midi.at(-1)).toEqual([0x81, 60, 0]);
  });

  it('plays a focused key with Space / Enter until keyup', () => {
    const { midi } = renderWidget(<MidiKeyboard def={def} />);
    const key = screen.getByRole('button', { name: 'C#4' });
    fireEvent.keyDown(key, { key: 'Enter' });
    expect(midi.at(-1)).toEqual([0x91, 61, 100]);
    fireEvent.keyUp(key, { key: 'Enter' });
    expect(midi.at(-1)).toEqual([0x81, 61, 0]);
    fireEvent.keyDown(key, { key: ' ' });
    expect(midi.at(-1)).toEqual([0x91, 61, 100]);
    fireEvent.keyUp(key, { key: ' ' });
    expect(midi.at(-1)).toEqual([0x81, 61, 0]);
  });

  it('releases all held notes on unmount', () => {
    const { midi, unmount } = renderWidget(<MidiKeyboard def={def} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'C4' }), { button: 0, pointerId: 1 });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'D4' }), { button: 0, pointerId: 2 });
    unmount();
    expect(midi.slice(-2)).toEqual([
      [0x81, 60, 0],
      [0x81, 62, 0],
    ]);
  });

  it('honours show_labels and colour overrides', () => {
    const { container } = renderWidget(
      <MidiKeyboard
        def={makeDef({
          type: 'midi_keyboard',
          start_note: 60,
          end_note: 60,
          show_labels: false,
          whiteKeyColor: 'ivory',
          blackKeyColor: 'black',
          accentColor: 'red',
        })}
      />,
    );
    expect(screen.queryByText('C4')).toBeNull();
    expect((container.querySelector('.cp-midi-key--white') as HTMLElement).style.backgroundColor).toBe('ivory');
  });

  it('handles reversed ranges and no channel without crashing', () => {
    const { container } = renderWidget(
      <MidiKeyboard def={makeDef({ type: 'midi_keyboard', start_note: 62, end_note: 60 })} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(container.querySelector('.cp-widget--midi_keyboard')?.getAttribute('title')).toBe('MIDI channel: 1');
  });
});
