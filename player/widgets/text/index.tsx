import type { ComponentType } from 'react';
import type { WidgetType } from '../../meta/types';
import type { WidgetProps } from '../types';
import { TextFader } from './TextFader';
import { TextMeter } from './TextMeter';
import { MidiKeyboard } from '../MidiKeyboard';

/** The keyboard with its box-drawing picture (the layout decides which one shows). */
function TextMidiKeyboard(props: WidgetProps) {
  return <MidiKeyboard {...props} art />;
}

/**
 * Text-style replacements used when the player runs with controls="text".
 * Types not listed here keep their graphic component (styled by the layout's CSS).
 */
export const TEXT_WIDGET_COMPONENTS: Partial<Record<WidgetType, ComponentType<WidgetProps>>> = {
  knob: TextFader,
  slider: TextFader,
  meter: TextMeter,
  midi_keyboard: TextMidiKeyboard,
};

export { TextFader, TextMeter };
export { FADER_CELLS, filledCells } from './TextFader';
export { cellZone } from './TextMeter';
