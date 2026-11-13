import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  inputChannelDefaults,
  outputChannels,
  parseWidgets,
} from '../../player/meta/parseWidgets';

const readFixture = (name: string) =>
  readFileSync(new URL(`../fixtures/instruments/${name}`, import.meta.url), 'utf8');

describe('parseWidgets — valid parsing', () => {
  it('parses a knob definition', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{id: "freq_knob"; label: "Frequency"; range: 100-1000; default: 440}>`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0]).toMatchObject({
      type: 'knob',
      id: 'freq_knob',
      line: 1,
      channel_name: 'freq',
      label: 'Frequency',
      min: 100,
      max: 1000,
      default: 440,
    });
  });

  it('parses a button', () => {
    const code = `k_trig chnget "play" ; <@WIDGET button:{id: "play_btn"; label: "Play"}>`;
    const result = parseWidgets(code);
    expect(result.widgets[0]).toMatchObject({
      type: 'button',
      channel_name: 'play',
      label: 'Play',
      min: 0,
      max: 1,
      default: 0,
    });
  });

  it('parses a chnset-backed meter', () => {
    const code = `chnset k_rms, "rms" ; <@WIDGET meter:{id: "rms_meter"; min: 0; max: 1}>`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0].type).toBe('meter');
    expect(result.widgets[0].channel_name).toBe('rms');
  });

  it('parses multiple widgets', () => {
    const code = `
            k_freq chnget "freq" ; <@WIDGET knob:{id: "freq_knob"; label: "Freq"; range: 20-20000; default: 440}>
            k_amp chnget "amp" ; <@WIDGET slider:{id: "amp_slider"; label: "Volume"; range: 0-1; default: 0.5}>
            k_gate chnget "gate" ; <@WIDGET button:{id: "gate_btn"; label: "Gate"}>
            `;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(3);
    expect(result.issues).toHaveLength(0);
  });

  it('parses a toggle definition', () => {
    const code = `k_bypass chnget "bypass" ; <@WIDGET toggle:{id: "bypass_toggle"; label: "Bypass"; default: 0}>`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets[0]).toMatchObject({
      type: 'toggle',
      channel_name: 'bypass',
      label: 'Bypass',
      min: 0,
      max: 1,
      default: 0,
    });
  });

  it('parses a dropdown with explicit option values', () => {
    const code = `k_wave chnget "waveform" ; <@WIDGET dropdown:{id: "wave_dropdown"; label: "Waveform"; options: "Sine=0; Saw=1; Square=2"; default: 0}>`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets[0]).toMatchObject({
      type: 'dropdown',
      channel_name: 'waveform',
      label: 'Waveform',
      default: 0,
      options: [
        { label: 'Sine', value: 0 },
        { label: 'Saw', value: 1 },
        { label: 'Square', value: 2 },
      ],
    });
  });

  it('parses a dropdown with implicit option values', () => {
    const code = `k_wave chnget "waveform" ; <@WIDGET dropdown:{id: "wave_dropdown"; options: "Sine; Saw; Square"}>`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets[0].options).toEqual([
      { label: 'Sine', value: 0 },
      { label: 'Saw', value: 1 },
      { label: 'Square', value: 2 },
    ]);
  });

  it('parses an xy_pad alias', () => {
    const code = `k_x chnget "padX" ; <@WIDGET xy_pad:{id: "xy_pad"; label: "XY Pad"; channel_x: "padX"; channel_y: "padY"; range_x: 0-1; range_y: 0-1; default_x: 0.5; default_y: 0.5}>`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets[0]).toMatchObject({
      type: 'xypad',
      channel_x_name: 'padX',
      channel_y_name: 'padY',
      label: 'XY Pad',
      min: 0,
      max: 1,
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
      default_x: 0.5,
      default_y: 0.5,
    });
  });

  it('binds a knob channel from functional chnget syntax', () => {
    const code = `kfreq = chnget("freq") ; <@WIDGET knob:{id: "knob_001"; label: "Frequency [Hz]"; range: 100-1000; default: 440; scale: "logarithmic"}>`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0]).toMatchObject({
      type: 'knob',
      id: 'knob_001',
      channel_name: 'freq',
      label: 'Frequency [Hz]',
      min: 100,
      max: 1000,
      default: 440,
      scale: 'logarithmic',
    });
  });

  it('binds a knob channel from functional chnget with a rate specifier', () => {
    const code = `kfreq = chnget:k("freq") ; <@WIDGET knob:{id: "knob_001"; label: "Frequency"; range: 100-1000; default: 440}>`;
    expect(parseWidgets(code).widgets[0]?.channel_name).toBe('freq');
  });

  it('binds a meter channel from functional chnset syntax', () => {
    const code = `chnset(k_rms, "rms") ; <@WIDGET meter:{id: "rms_meter"; min: 0; max: 1}>`;
    const result = parseWidgets(code);
    expect(result.widgets[0].type).toBe('meter');
    expect(result.widgets[0].channel_name).toBe('rms');
  });

  it('keeps a plain group property', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{id: "k1"; group: "Filter"; range: 0-10}>`;
    expect(parseWidgets(code).widgets[0].group).toBe('Filter');
  });

  it.each([
    ['channel', 'a'],
    ['channel_name', 'b'],
    ['param', 'c'],
    ['paramId', 'd'],
  ])('accepts the %s channel alias', (key, expected) => {
    const code = `; <@WIDGET knob:{id: "k1"; ${key}: "${expected}"}>`;
    expect(parseWidgets(code).widgets[0].channel_name).toBe(expected);
  });

  it('parses negative ranges', () => {
    const code = `; <@WIDGET knob:{id: "k1"; range: -1-1; default: -1}>
; <@WIDGET knob:{id: "k2"; range: -60-0; default: -60}>`;
    const result = parseWidgets(code);
    expect(result.issues).toEqual([]);
    expect(result.widgets[0]).toMatchObject({ min: -1, max: 1, default: -1 });
    expect(result.widgets[1]).toMatchObject({ min: -60, max: 0, default: -60 });
  });

  it('keeps arbitrary properties', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{id: "k1"; knobColor: "#1e1e2e"; arcColor: "#ff6b6b"}>`;
    expect(parseWidgets(code).widgets[0]).toMatchObject({
      knobColor: '#1e1e2e',
      arcColor: '#ff6b6b',
    });
  });
});

describe('parseWidgets — ids and merging', () => {
  it('generates a 3-digit id from the type and creation counter', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{label: "Frequency"}>`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets[0].id).toBe('knob_001');
  });

  it('increments the generated counter across widgets', () => {
    const code = `
k_freq chnget "freq" ; <@WIDGET knob:{label: "Frequency"}>
k_vol chnget "vol" ; <@WIDGET slider:{label: "Vol"}>
`;
    const result = parseWidgets(code);
    expect(result.widgets.map((w) => w.id)).toEqual(['knob_001', 'slider_002']);
    expect(result.issues).toHaveLength(0);
  });

  it('merges two lines with the same explicit id', () => {
    const code = `
; <@WIDGET xypad:{id: "xy"; channel_x: "pan"; range_x: 0-2}>
; <@WIDGET xypad:{id: "xy"; channel_y: "depth"; group: "Mod"}>
`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(0);
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0]).toMatchObject({
      id: 'xy',
      line: 2,
      channel_x_name: 'pan',
      channel_y_name: 'depth',
      group: 'Mod',
    });
  });

  it('records the 1-based line of the line that created the widget', () => {
    const code = `; line 1
; line 2
k_freq chnget "freq" ; <@WIDGET knob:{id: "k1"}>`;
    expect(parseWidgets(code).widgets[0].line).toBe(3);
  });

  it('uses the channel as the fallback label', () => {
    const code = `k_freq chnget "myChannel" ; <@WIDGET knob:{range: 0-100}>`;
    expect(parseWidgets(code).widgets[0].label).toBe('myChannel');
  });

  it('handles properties with colons in quoted values', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{label: "Freq: Hz"; range: 0-100}>`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0].label).toBe('Freq: Hz');
  });
});

describe('parseWidgets — unsupported and malformed definitions', () => {
  it.each([
    'container',
    'group',
    'filmstrip',
    'waveshaper',
    'sequencer',
    'asset_picker',
    'image',
  ])('skips unsupported type "%s" with a warning', (type) => {
    const code = `; <@WIDGET ${type}:{id: "x"; label: "Thing"}>`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      severity: 'warning',
      line: 1,
      message: `Widget type "${type}" is not supported by this player`,
    });
    expect(result.issues[0].raw).toBe(code.trim());
  });

  it('skips an unknown type instead of falling back to knob', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET dial:{id: "dial1"; label: "Freq"; range: 0-1}>`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(0);
    expect(result.issues[0].severity).toBe('warning');
    expect(result.issues[0].message).toBe(
      'Widget type "dial" is not supported by this player',
    );
  });

  it('reports a dropdown without options and skips it', () => {
    const code = `k_wave chnget "wave" ; <@WIDGET dropdown:{id: "wave1"; label: "Wave"}>`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(0);
    expect(result.issues.some((i) => i.message.includes('dropdown'))).toBe(true);
    expect(result.issues.some((i) => i.message.includes('options'))).toBe(true);
  });

  it('reports a dropdown whose option list is empty and skips it', () => {
    const code = `k_wave chnget "wave" ; <@WIDGET dropdown:{id: "wave1"; options: ""}>`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(0);
    expect(result.issues.some((i) => i.message.includes('options'))).toBe(true);
  });

  it('reports an invalid range but still creates the widget', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{id: "freq1"; label: "Freq"; range: abc-xyz}>`;
    const result = parseWidgets(code);
    expect(result.issues.some((i) => i.message.includes('Invalid range'))).toBe(true);
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0]).toMatchObject({ min: 0, max: 1 });
  });

  it('coerces non-numeric min/max/default so controls never receive strings', () => {
    const code = `k_amp = chnget("amp") ; <@WIDGET knob:{id: "ampKnob"; label: "Amplitude"; channel_name: "amp"; range: ？ Let's write: range: 0-1; default: ？}>`;
    const result = parseWidgets(code);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.widgets.length).toBeGreaterThan(0);
    const knob = result.widgets[0];
    expect(typeof knob.min).toBe('number');
    expect(typeof knob.max).toBe('number');
    expect(typeof knob.default).toBe('number');
    expect(Number.isFinite(knob.min)).toBe(true);
    expect(Number.isFinite(knob.max)).toBe(true);
    expect(Number.isFinite(knob.default)).toBe(true);
  });

  it('recovers a malformed widget when the recovered type is supported', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{id: "k1"; label: "F"`;
    const result = parseWidgets(code);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'error', line: 1 });
    expect(result.issues[0].message).toContain('Malformed');
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0]).toMatchObject({
      type: 'knob',
      id: 'k1',
      channel_name: 'freq',
    });
  });

  it('does not recover a malformed widget with an unsupported type', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET container:{label: "G"`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
  });

  it('reports malformed property parts', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{id: "k1"; garbage}>`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(1);
    expect(result.issues.some((i) => i.message.includes('Invalid property format'))).toBe(true);
  });
});

describe('parseWidgets — multi-line opcodes and opcode routing', () => {
  it('ignores @INSTRUMENT lines', () => {
    const code = `;<@INSTRUMENT: {name: "X"; type: "synth"}>
k_freq chnget "freq" ; <@WIDGET knob:{id: "k1"}>`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it('warns about an unknown meta-opcode', () => {
    const code = `; <@SCENE>`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning', line: 1 });
    expect(result.issues[0].message).toBe('Unknown meta-opcode');
  });

  it('warns about an incomplete meta-opcode marker', () => {
    const code = `k_freq chnget "freq" ; <@`;
    const result = parseWidgets(code);
    expect(result.widgets).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning', line: 1 });
    expect(result.issues[0].message).toBe('Unknown meta-opcode');
  });

  it('returns nothing for empty code', () => {
    expect(parseWidgets('')).toEqual({ widgets: [], issues: [] });
  });
});

describe('parseWidgets — midi_keyboard, button and the removed waveform', () => {
  it('no longer supports waveform: it is skipped with a warning', () => {
    const result = parseWidgets(`; <@WIDGET waveform:{id: "wf"; channel1: "a"}>`);
    expect(result.widgets).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', message: 'Widget type "waveform" is not supported by this player' })]);
  });

  it('applies midi_keyboard defaults', () => {
    const code = `; <@WIDGET midi_keyboard:{id: "mk"}>`;
    expect(parseWidgets(code).widgets[0]).toMatchObject({
      type: 'midi_keyboard',
      midi_channel: 1,
      start_note: 48,
      end_note: 72,
      show_labels: true,
    });
  });

  it('keeps explicit midi_keyboard values', () => {
    const code = `; <@WIDGET midi_keyboard:{id: "mk"; midi_channel: 3; start_note: 36; end_note: 84; show_labels: false}>`;
    expect(parseWidgets(code).widgets[0]).toMatchObject({
      midi_channel: 3,
      start_note: 36,
      end_note: 84,
      show_labels: false,
    });
  });

  it('keeps a button mode', () => {
    const code = `k t chnget "t" ; <@WIDGET button:{id: "b"; mode: "momentary"}>`;
    expect(parseWidgets(code).widgets[0].mode).toBe('momentary');
  });
});

describe('inputChannelDefaults', () => {
  it('returns initial values for channels the board writes', () => {
    const code = `
k_a chnget "a" ; <@WIDGET knob:{id: "a"; default: 2}>
k_b chnget "b" ; <@WIDGET slider:{id: "b"; default: 0.5}>
; <@WIDGET dropdown:{id: "c"; channel_name: "c"; options: "Low=5; High=10"}>
; <@WIDGET dropdown:{id: "d"; channel_name: "d"; options: "High=10; Low=2"; default: 2}>
k_e chnget "e" ; <@WIDGET checkbox:{id: "e"; default: 5}>
k_f chnget "f" ; <@WIDGET toggle:{id: "f"; default: -1}>
k_g chnget "g" ; <@WIDGET button:{id: "g"}>
; <@WIDGET xypad:{id: "xy"; channel_x: "x"; channel_y: "y"; default_x: 0.2; range_y: -1-1}>
; <@WIDGET label:{id: "lbl"; text: "Hi"}>
`;
    const defaults = inputChannelDefaults(parseWidgets(code).widgets);
    expect(defaults).toEqual({
      a: 2,
      b: 0.5,
      c: 5,
      d: 2,
      e: 1,
      f: 0,
      g: 0,
      x: 0.2,
      y: -1,
    });
  });

  it('uses minX/minY when no xypad defaults are given', () => {
    const code = `; <@WIDGET xypad:{id: "xy"; channel_x: "x"; channel_y: "y"; range_x: 10-20; range_y: -5-5}>`;
    expect(inputChannelDefaults(parseWidgets(code).widgets)).toEqual({ x: 10, y: -5 });
  });

  it('skips widgets without a channel', () => {
    const code = `; <@WIDGET label:{id: "l"; text: "Hi"}>`;
    expect(inputChannelDefaults(parseWidgets(code).widgets)).toEqual({});
  });
});

describe('outputChannels', () => {
  it('lists unique read channels (meters, labels with a channel) in order, skipping numeric names', () => {
    const code = `
chnset k_rms, "rms" ; <@WIDGET meter:{id: "m"}>
chnset(k_rms, "rms") ; <@WIDGET label:{id: "l1"; text: "RMS: {value}"}>
chnset(k_peak, "peak") ; <@WIDGET label:{id: "l2"; decimals: 1}>
; <@WIDGET label:{id: "l3"; channel: "5"}>
; <@WIDGET label:{id: "l4"; text: "Static"}>
`;
    expect(outputChannels(parseWidgets(code).widgets)).toEqual(['rms', 'peak']);
  });

  it('binds a label on a chnset line to its channel and keeps decimals numeric', () => {
    const [label] = parseWidgets(`chnset(k_rms, "rms") ; <@WIDGET label:{id: "lbl"; text: "RMS: {value}"; decimals: "3"}>`).widgets;
    expect(label).toMatchObject({ type: 'label', channel_name: 'rms', text: 'RMS: {value}', decimals: 3 });
  });

  it('returns an empty list when only input widgets exist', () => {
    const code = `k_freq chnget "freq" ; <@WIDGET knob:{id: "k1"}>`;
    expect(outputChannels(parseWidgets(code).widgets)).toEqual([]);
  });
});

describe('parseWidgets — real instruments', () => {
  it('parses algo_synth.csd without errors', () => {
    const result = parseWidgets(readFixture('algo_synth.csd'));
    expect(result.issues).toEqual([]);
    expect(result.widgets.map((w) => w.type)).toEqual([
      'knob',
      'toggle',
      'knob',
      'knob',
    ]);
    expect(result.widgets[0]).toMatchObject({
      id: 'kbpm',
      channel_name: 'bpm',
      min: 40,
      max: 200,
      default: 120,
    });
    expect(result.widgets[1]).toMatchObject({
      type: 'toggle',
      id: 'trun',
      channel_name: 'run',
      default: 1,
    });
    expect(result.widgets[2]).toMatchObject({
      id: 'kcut',
      channel_name: 'cutoff',
      min: 100,
      max: 8000,
      default: 2000,
    });
    expect(result.widgets[3]).toMatchObject({
      id: 'kres',
      channel_name: 'res',
      min: 0,
      max: 0.9,
      default: 0.3,
    });
  });

  it('parses grand_piano.csd without errors', () => {
    const result = parseWidgets(readFixture('grand_piano.csd'));
    expect(result.issues).toEqual([]);
    expect(result.widgets).toHaveLength(7);
    expect(result.widgets.map((w) => w.type)).toEqual([
      'knob',
      'knob',
      'knob',
      'knob',
      'knob',
      'knob',
      'button',
    ]);
    expect(result.widgets.map((w) => w.id)).toEqual([
      'knob-hardness',
      'knob-sustain',
      'knob-stiffness',
      'knob-detune',
      'knob-body',
      'knob-reverb',
      'button-trig',
    ]);
    expect(result.widgets[0]).toMatchObject({
      channel_name: 'hardness',
      min: 500,
      max: 15000,
      default: 6000,
    });
    expect(result.widgets[6]).toMatchObject({
      type: 'button',
      channel_name: 'trig',
      label: 'PLAY C-NOTE',
      min: 0,
      max: 1,
      default: 0,
    });
  });

  it('parses sub_synth.csd without errors', () => {
    const result = parseWidgets(readFixture('sub_synth.csd'));
    expect(result.issues).toEqual([]);
    expect(result.widgets).toHaveLength(6);
    expect(result.widgets[0]).toMatchObject({
      type: 'midi_keyboard',
      id: 'midi_keyboard_001',
      midi_channel: 1,
    });
    expect(result.widgets.map((w) => w.id).slice(1)).toEqual([
      'knob_cutoff',
      'knob_attack',
      'knob_decay',
      'knob_sustain',
      'knob_release',
    ]);
    expect(result.widgets[1]).toMatchObject({
      channel_name: 'cutoff',
      min: 100,
      max: 8000,
      default: 1000,
    });
    expect(result.widgets[5]).toMatchObject({
      channel_name: 'release',
      min: 0.01,
      max: 2,
      default: 0.3,
    });
  });
});
