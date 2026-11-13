/**
 * Shared types for the two meta-opcodes the portfolio understands:
 *   ; <@WIDGET type:{key: value; ...}>       widgets on the board
 *   ;<@INSTRUMENT: {key: value; ...}>        card text and instrument settings
 */

export const WIDGET_TYPES = [
  'knob',
  'slider',
  'label',
  'button',
  'checkbox',
  'toggle',
  'dropdown',
  'xypad',
  'meter',
  'midi_keyboard',
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

export interface DropdownOption {
  label: string;
  value: number;
}

export interface WidgetDef {
  type: WidgetType;
  /** Unique within one CSD. Taken from `id:` or generated as `<type>_<NNN>`. */
  id: string;
  /** 1-based line of the (first) @WIDGET line that defined this widget. */
  line: number;
  /** Bound control channel (input widgets, meter). */
  channel_name?: string;
  label?: string;
  /** Optional board section title; widgets with the same group are shown together. */
  group?: string;

  min: number;
  max: number;
  default: number;
  step?: number;
  /** `"logarithmic"` spaces a knob/slider sweep geometrically. */
  scale?: string;
  showValue?: boolean;
  orientation?: 'vertical' | 'horizontal';

  // label / button text. A label bound to a channel shows its value: `{value}` in
  // `text` marks where; `decimals` sets the precision.
  text?: string;
  decimals?: number;
  // button
  mode?: string;

  // dropdown
  options?: DropdownOption[];

  // xypad
  channel_x_name?: string;
  channel_y_name?: string;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  default_x?: number;
  default_y?: number;

  // midi_keyboard
  midi_channel?: number;
  start_note?: number;
  end_note?: number;
  show_labels?: boolean;

  /** Size hints only; positions (x, y) are ignored by the auto-layout board. */
  width?: number;
  height?: number;

  /** Any other property from the meta-opcode (colours etc.) is kept as-is. */
  [key: string]: unknown;
}

export interface MetaIssue {
  /** 1-based line number in the CSD. */
  line: number;
  severity: 'error' | 'warning';
  message: string;
  raw?: string;
}

export interface WidgetParseResult {
  widgets: WidgetDef[];
  issues: MetaIssue[];
}

export interface InstrumentMeta {
  name?: string;
  type: 'synth' | 'effect';
  author?: string;
  description?: string;
  tags: string[];
  license?: string;
  midi?: 'on' | 'off';
  order?: number;
  draft: boolean;
  /** Release date: "YYYY", "YYYY-MM" or "YYYY-MM-DD". Used for the portfolio timeline. */
  date?: string;
}

export interface InstrumentParseResult {
  /** null when the CSD has no @INSTRUMENT line. */
  meta: InstrumentMeta | null;
  /** 1-based line of the @INSTRUMENT line that was used. */
  line?: number;
  issues: MetaIssue[];
}
