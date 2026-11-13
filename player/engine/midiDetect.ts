/**
 * Decides whether an instrument receives MIDI input.
 *
 * Csound's default MIDI routing sends channel N to `instr N`, so turning MIDI on
 * for an instrument that wasn't written for it can start unwanted extra
 * instances (e.g. a sequencer in instr 1). MIDI is therefore only enabled when
 * the CSD clearly uses it, or when its @INSTRUMENT line says so.
 */
import { blankStrings, getSection, stripComments } from './csdText';

/** Opcodes that only make sense with MIDI input. */
export const MIDI_INPUT_OPCODES = [
  'massign', 'pgmassign', 'notnum', 'veloc', 'cpsmidi', 'cpsmidib', 'cpstmid', 'octmidi', 'octmidib',
  'pchmidi', 'pchmidib', 'ampmidi', 'ampmidid', 'ampmidicurve', 'midiin', 'midictrl', 'ctrl7', 'ctrl14',
  'ctrl21', 'initc7', 'initc14', 'initc21', 'ctrlinit', 'ctrlsave', 'ctrlprint', 'ctrlprintpresets',
  'ctrlpreset', 'ctrlselect', 'pchbend', 'aftouch', 'polyaft', 'midichn', 'midinoteonkey',
  'midinoteoncps', 'midinoteonoct', 'midinoteonpch', 'midichannelaftertouch', 'midicontrolchange',
  'midipitchbend', 'midipolyaftertouch', 'midiprogramchange', 'mididefault', 'chanctrl', 'midipgm',
];

const OPCODE_RE = new RegExp(`(^|[^A-Za-z0-9_])(${MIDI_INPUT_OPCODES.join('|')})(?![A-Za-z0-9_])`, 'm');
const KEYBOARD_WIDGET_RE = /<@WIDGET\s+midi_keyboard\s*:/i;

export type MidiOverride = 'on' | 'off' | undefined;

export interface MidiDecision {
  enabled: boolean;
  reason: 'override' | 'opcode' | 'keyboard-widget' | 'none';
  detail?: string;
}

/**
 * @param code     full CSD text (or orchestra text)
 * @param override value of `@INSTRUMENT midi`, if any
 */
export function detectMidi(code: string, override?: MidiOverride): MidiDecision {
  if (override === 'on') return { enabled: true, reason: 'override' };
  if (override === 'off') return { enabled: false, reason: 'override' };
  const orchestra = getSection(code, 'CsInstruments') ?? code;
  const match = blankStrings(stripComments(orchestra)).match(OPCODE_RE);
  if (match) return { enabled: true, reason: 'opcode', detail: match[2] };
  // The keyboard widget lives in a comment, so check the raw text.
  if (KEYBOARD_WIDGET_RE.test(code)) return { enabled: true, reason: 'keyboard-widget' };
  return { enabled: false, reason: 'none' };
}
