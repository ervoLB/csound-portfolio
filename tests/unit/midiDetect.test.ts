import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIDI_INPUT_OPCODES, detectMidi } from '../../player/engine/midiDetect';

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/instruments/${name}`, import.meta.url), 'utf8');

const orchestra = (body: string): string => `instr 1\n${body}\nendin`;

const fullCsd = (instruments: string, extras: { options?: string; score?: string } = {}): string =>
  [
    '<CsoundSynthesizer>',
    '<CsOptions>',
    extras.options ?? '',
    '</CsOptions>',
    '<CsInstruments>',
    instruments,
    '</CsInstruments>',
    '<CsScore>',
    extras.score ?? 'i1 0 1',
    '</CsScore>',
    '</CsoundSynthesizer>',
  ].join('\n');

describe('detectMidi on the real instruments', () => {
  it('disables MIDI for algo_synth.csd', () => {
    expect(detectMidi(fixture('algo_synth.csd'))).toEqual({ enabled: false, reason: 'none' });
  });

  it('enables MIDI for grand_piano.csd through massign', () => {
    expect(detectMidi(fixture('grand_piano.csd'))).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'massign',
    });
  });

  it('enables MIDI for sub_synth.csd through its opcode, not its keyboard widget', () => {
    expect(detectMidi(fixture('sub_synth.csd'))).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'massign',
    });
  });

  it('lets an explicit override win on a real instrument', () => {
    expect(detectMidi(fixture('grand_piano.csd'), 'off')).toEqual({ enabled: false, reason: 'override' });
    expect(detectMidi(fixture('algo_synth.csd'), 'on')).toEqual({ enabled: true, reason: 'override' });
  });
});

describe('detectMidi overrides', () => {
  it('enables MIDI on request even for empty text', () => {
    expect(detectMidi('', 'on')).toEqual({ enabled: true, reason: 'override' });
  });

  it('disables MIDI on request even when an opcode is present', () => {
    expect(detectMidi(orchestra('massign 0, 2'), 'off')).toEqual({ enabled: false, reason: 'override' });
  });

  it('disables MIDI on request even when a keyboard widget is present', () => {
    const code = '; <@WIDGET midi_keyboard:{id: "keys"}>\ninstr 1\nendin';
    expect(detectMidi(code, 'off')).toEqual({ enabled: false, reason: 'override' });
  });

  it('does not add a detail for an override decision', () => {
    expect(detectMidi(orchestra('massign 0, 2'), 'on').detail).toBeUndefined();
    expect(detectMidi(orchestra('massign 0, 2'), 'off').detail).toBeUndefined();
  });

  it('treats an undefined override as no override', () => {
    expect(detectMidi(orchestra('notnum'), undefined)).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'notnum',
    });
    expect(detectMidi('instr 1\nendin', undefined)).toEqual({ enabled: false, reason: 'none' });
  });
});

describe('detectMidi opcode detection', () => {
  it('detects massign as a whole word', () => {
    expect(detectMidi(orchestra('massign 0, 2'))).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'massign',
    });
  });

  it('detects an opcode used in expression position', () => {
    expect(detectMidi(orchestra('iNote notnum'))).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'notnum',
    });
    expect(detectMidi(orchestra('kNote = notnum()'))).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'notnum',
    });
  });

  it('detects an opcode at the very start of the text', () => {
    expect(detectMidi('massign 0, 2')).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'massign',
    });
  });

  it('detects an opcode surrounded by punctuation', () => {
    expect(detectMidi(orchestra('x (notnum)'))).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'notnum',
    });
    expect(detectMidi(orchestra('x ,notnum,'))).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: 'notnum',
    });
  });

  it.each(MIDI_INPUT_OPCODES)('detects the documented opcode %s', (opcode) => {
    expect(detectMidi(orchestra(`x ${opcode}`))).toEqual({
      enabled: true,
      reason: 'opcode',
      detail: opcode,
    });
  });

  const nonOpcodes = ['massignment', 'my_notnum', 'notnum2', 'notnum_x', 'xmassign', 'ampmidiX', 'ctrl7x', 'cpsmidinn'];

  it.each(nonOpcodes)('does not match the opcode name embedded in %s', (word) => {
    expect(detectMidi(orchestra(`x ${word}`))).toEqual({ enabled: false, reason: 'none' });
  });

  it('ignores an opcode that only appears in a semicolon comment', () => {
    expect(detectMidi(orchestra('; massign 0, 2'))).toEqual({ enabled: false, reason: 'none' });
  });

  it('ignores an opcode that only appears in a double-slash comment', () => {
    expect(detectMidi(orchestra('x = 1 // notnum'))).toEqual({ enabled: false, reason: 'none' });
  });

  it('ignores an opcode that only appears in a multi-line block comment', () => {
    expect(detectMidi(orchestra('/* notnum\n   cpsmidi */'))).toEqual({ enabled: false, reason: 'none' });
  });

  it('ignores an opcode that is only mentioned in comments mixed with real code', () => {
    const code = orchestra('; notnum\nx = 1\n/* veloc */\n// aftouch');
    expect(detectMidi(code)).toEqual({ enabled: false, reason: 'none' });
  });

  it('does not enable MIDI for an opcode that only appears inside a string literal', () => {
    expect(detectMidi(orchestra('S "notnum"'))).toEqual({ enabled: false, reason: 'none' });
  });

  it('does not enable MIDI for massign that only appears inside a string literal', () => {
    expect(detectMidi(orchestra('S "massign 0, 2"'))).toEqual({ enabled: false, reason: 'none' });
  });

  it('only scans the CsInstruments section when it exists', () => {
    const code = fullCsd('instr 2\nendin', { score: 'massign 0, 2' });
    expect(detectMidi(code)).toEqual({ enabled: false, reason: 'none' });
  });

  it('ignores opcodes in CsOptions when CsInstruments exists', () => {
    const code = fullCsd('instr 2\nendin', { options: 'notnum' });
    expect(detectMidi(code)).toEqual({ enabled: false, reason: 'none' });
  });

  it('detects an opcode inside CsInstruments', () => {
    const code = fullCsd('instr 2\n  iNote notnum\nendin');
    expect(detectMidi(code)).toEqual({ enabled: true, reason: 'opcode', detail: 'notnum' });
  });

  it('finds CsInstruments regardless of tag case', () => {
    const code = '<CSOUNDSYNTHESIZER>\n<csinstruments>\ninstr 1\n  iNote notnum\nendin\n</CSINSTRUMENTS>\n</CSOUNDSYNTHESIZER>';
    expect(detectMidi(code)).toEqual({ enabled: true, reason: 'opcode', detail: 'notnum' });
  });

  it('detects opcodes in CRLF text', () => {
    const code = '<CsInstruments>\r\ninstr 1\r\n  iNote notnum\r\nendin\r\n</CsInstruments>';
    expect(detectMidi(code)).toEqual({ enabled: true, reason: 'opcode', detail: 'notnum' });
  });

  it('ignores opcodes in CRLF comments', () => {
    const code = '<CsInstruments>\r\ninstr 1\r\n  ; massign 0, 2\r\nendin\r\n</CsInstruments>';
    expect(detectMidi(code)).toEqual({ enabled: false, reason: 'none' });
  });

  it('scans the whole text when there is no CsInstruments section', () => {
    const code = '; raw orchestra\ninstr 1\n  iNote notnum\nendin';
    expect(detectMidi(code)).toEqual({ enabled: true, reason: 'opcode', detail: 'notnum' });
  });

  it('scans CsOptions as part of the whole text when there is no CsInstruments section', () => {
    const code = '<CsoundSynthesizer>\n<CsOptions>\nnotnum\n</CsOptions>\n</CsoundSynthesizer>';
    expect(detectMidi(code)).toEqual({ enabled: true, reason: 'opcode', detail: 'notnum' });
  });

  it('returns a none decision for empty text', () => {
    expect(detectMidi('')).toEqual({ enabled: false, reason: 'none' });
  });

  it('returns a none decision for an orchestra without MIDI', () => {
    expect(detectMidi(orchestra('out oscili(0.5, 440)'))).toEqual({ enabled: false, reason: 'none' });
  });
});

describe('detectMidi keyboard widget', () => {
  it('enables MIDI for a midi_keyboard widget', () => {
    expect(detectMidi('; <@WIDGET midi_keyboard:{id: "keys"}>\ninstr 1\nendin')).toEqual({
      enabled: true,
      reason: 'keyboard-widget',
    });
  });

  it('recognises the widget name case-insensitively', () => {
    expect(detectMidi('; <@WIDGET MIDI_KEYBOARD:{id: "keys"}>')).toEqual({
      enabled: true,
      reason: 'keyboard-widget',
    });
  });

  it('allows whitespace before the colon', () => {
    expect(detectMidi('; <@WIDGET midi_keyboard :{id: "keys"}>')).toEqual({
      enabled: true,
      reason: 'keyboard-widget',
    });
    expect(detectMidi('; <@WIDGET midi_keyboard\t:{id: "keys"}>')).toEqual({
      enabled: true,
      reason: 'keyboard-widget',
    });
  });

  it('finds the widget in a block comment', () => {
    expect(detectMidi('/* <@WIDGET midi_keyboard:{id: "keys"}> */\ninstr 1\nendin')).toEqual({
      enabled: true,
      reason: 'keyboard-widget',
    });
  });

  it('finds the widget anywhere in a full CSD, not only in CsInstruments', () => {
    const code = fullCsd('instr 2\nendin', { score: '; <@WIDGET midi_keyboard:{id: "keys"}>' });
    expect(detectMidi(code)).toEqual({ enabled: true, reason: 'keyboard-widget' });
  });

  it('prefers an opcode over the widget when both are present', () => {
    const code = '; <@WIDGET midi_keyboard:{id: "keys"}>\ninstr 1\n  massign 0, 2\nendin';
    expect(detectMidi(code)).toEqual({ enabled: true, reason: 'opcode', detail: 'massign' });
  });

  it('ignores a widget name without a colon', () => {
    expect(detectMidi('; <@WIDGET midi_keyboard>')).toEqual({ enabled: false, reason: 'none' });
  });

  it('ignores a longer widget name that starts with midi_keyboard', () => {
    expect(detectMidi('; <@WIDGET midi_keyboardX:{id: "keys"}>')).toEqual({
      enabled: false,
      reason: 'none',
    });
  });

  it('ignores a widget tag without whitespace before the name', () => {
    expect(detectMidi('; <@WIDGETmidi_keyboard:{id: "keys"}>')).toEqual({
      enabled: false,
      reason: 'none',
    });
  });

  it('does not confuse other widgets with the keyboard widget', () => {
    expect(detectMidi('; <@WIDGET knob:{id: "cutoff"}>\ninstr 1\nendin')).toEqual({
      enabled: false,
      reason: 'none',
    });
  });
});
