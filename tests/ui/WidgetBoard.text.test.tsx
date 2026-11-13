// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { AUTO_KEYBOARD_ID, WidgetBoard } from '../../player/ui/WidgetBoard';
import { makeDef, renderWidget } from '../widgets/helpers';

const widgets = [
  makeDef({ type: 'knob', id: 'knob_001', channel_name: 'cutoff', label: 'Cutoff' }),
  makeDef({ type: 'slider', id: 'slider_001', channel_name: 'gain', label: 'Gain' }),
  makeDef({ type: 'meter', id: 'meter_001', channel_name: 'level', label: 'Level' }),
  makeDef({ type: 'checkbox', id: 'checkbox_001', channel_name: 'on', label: 'On' }),
  makeDef({ type: 'button', id: 'button_001', channel_name: 'trigger', label: 'Trigger' }),
];

function cell(container: HTMLElement, id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
  if (!element) throw new Error(`No board cell for widget ${id}`);
  return element;
}

describe('WidgetBoard controls mode', () => {
  it('uses text widgets for knob, slider and meter, and keeps graphic widgets for other types', () => {
    const { container } = renderWidget(
      <WidgetBoard widgets={widgets} position="right" midiEnabled={false} controls="text" />,
    );

    const board = container.querySelector('.cp-board')!;
    expect(board.className).toContain('cp-board--text');
    expect(board.className).not.toContain('cp-board--graphic');

    expect(cell(container, 'knob_001').querySelector('.cp-tfader')).toBeTruthy();
    expect(cell(container, 'knob_001').querySelector('.cp-widget--knob')).toBeNull();
    expect(cell(container, 'slider_001').querySelector('.cp-tfader')).toBeTruthy();
    expect(cell(container, 'slider_001').querySelector('.cp-widget--slider')).toBeNull();
    expect(cell(container, 'meter_001').querySelector('.cp-tmeter')).toBeTruthy();
    expect(cell(container, 'meter_001').querySelector('.cp-widget--meter')).toBeNull();

    // Types without a text component keep their graphic version.
    expect(cell(container, 'checkbox_001').querySelector('.cp-widget--checkbox')).toBeTruthy();
    expect(cell(container, 'checkbox_001').querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(cell(container, 'button_001').querySelector('.cp-widget--button')).toBeTruthy();
    expect(cell(container, 'button_001').querySelector('button')?.textContent).toBe('Trigger');
  });

  it('uses graphic widgets by default', () => {
    const { container } = renderWidget(<WidgetBoard widgets={widgets} position="bottom" midiEnabled={false} />);

    const board = container.querySelector('.cp-board')!;
    expect(board.className).toContain('cp-board--graphic');
    expect(board.className).toContain('cp-board--bottom');
    expect(board.className).not.toContain('cp-board--text');

    expect(cell(container, 'knob_001').querySelector('.cp-widget--knob')).toBeTruthy();
    expect(cell(container, 'knob_001').querySelector('.cp-tfader')).toBeNull();
    expect(cell(container, 'slider_001').querySelector('.cp-widget--slider')).toBeTruthy();
    expect(cell(container, 'meter_001').querySelector('.cp-widget--meter')).toBeTruthy();
    expect(cell(container, 'checkbox_001').querySelector('.cp-widget--checkbox')).toBeTruthy();
    expect(cell(container, 'button_001').querySelector('.cp-widget--button')).toBeTruthy();
  });

  it('honours an explicit graphic mode', () => {
    const { container } = renderWidget(
      <WidgetBoard widgets={widgets} position="right" midiEnabled={false} controls="graphic" />,
    );
    expect(container.querySelector('.cp-board')!.className).toContain('cp-board--graphic');
    expect(container.querySelector('.cp-tfader')).toBeNull();
  });

  it('still adds the automatic keyboard for MIDI instruments in text mode', () => {
    const { container } = renderWidget(
      <WidgetBoard widgets={[widgets[0]]} position="right" midiEnabled controls="text" />,
    );

    const keyboard = cell(container, AUTO_KEYBOARD_ID);
    expect(keyboard.querySelector('.cp-widget--midi_keyboard')).toBeTruthy();
    expect(keyboard.querySelector('.cp-midi-keyboard')).toBeTruthy();
    expect(container.querySelector('.cp-board')!.className).toContain('cp-board--text');
  });

  it('does not add the automatic keyboard when one is declared or MIDI is off', () => {
    const declared = makeDef({ type: 'midi_keyboard', id: 'keyboard_001' });
    const withKeyboard = renderWidget(
      <WidgetBoard widgets={[declared, widgets[0]]} position="right" midiEnabled controls="text" />,
    );
    expect(withKeyboard.container.querySelectorAll('[data-widget-id="keyboard_001"]')).toHaveLength(1);

    const withoutMidi = renderWidget(
      <WidgetBoard widgets={[widgets[0]]} position="right" midiEnabled={false} controls="text" />,
    );
    expect(withoutMidi.container.querySelector(`[data-widget-id="${AUTO_KEYBOARD_ID}"]`)).toBeNull();
  });
});
