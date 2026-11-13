import type { ComponentType } from 'react';
import type { WidgetType } from '../meta/types';
import type { WidgetProps } from './types';
import { Knob } from './Knob';
import { Slider } from './Slider';
import { Label } from './Label';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { Toggle } from './Toggle';
import { Dropdown } from './Dropdown';
import { XYPad } from './XYPad';
import { Meter } from './Meter';
import { MidiKeyboard } from './MidiKeyboard';

/** One component per @WIDGET type, used by the widget board. */
export const WIDGET_COMPONENTS: Record<WidgetType, ComponentType<WidgetProps>> = {
  knob: Knob,
  slider: Slider,
  label: Label,
  button: Button,
  checkbox: Checkbox,
  toggle: Toggle,
  dropdown: Dropdown,
  xypad: XYPad,
  meter: Meter,
  midi_keyboard: MidiKeyboard,
};

export {
  Knob,
  Slider,
  Label,
  Button,
  Checkbox,
  Toggle,
  Dropdown,
  XYPad,
  Meter,
  MidiKeyboard,
};
export type { WidgetProps } from './types';
