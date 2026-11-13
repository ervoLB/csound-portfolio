// @vitest-environment jsdom
import {
  CompletionContext,
  type Completion,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import {
  channelBeforeComment,
  fillTemplate,
  humanize,
  metaCompletionSource,
  opcodeCompletionSource,
} from '../../player/editor/completions';

function makeContext(doc: string, pos = doc.length, explicit = false): CompletionContext {
  return new CompletionContext(EditorState.create({ doc }), pos, explicit);
}

/** Apply a completion option to a throw-away editor and return the resulting document. */
function applyOption(doc: string, pos: number, result: CompletionResult, label: string): string {
  const view = new EditorView({ state: EditorState.create({ doc }), parent: document.body });
  try {
    const option = result.options.find((candidate) => candidate.label === label);
    expect(option).toBeDefined();
    const apply = option!.apply;
    expect(typeof apply).toBe('function');
    (apply as (view: EditorView, completion: Completion, from: number, to: number) => void)(
      view,
      option!,
      result.from,
      pos,
    );
    return view.state.doc.toString();
  } finally {
    view.destroy();
  }
}

const KNOB_TEMPLATE = {
  type: 'knob',
  detail: 'rotary control',
  channelProp: 'channel',
  body: 'knob:{id: "${1:$ID}"; label: "${2:$LABEL}"; channel: "${3:$CHANNEL}"; range: ${4:0-1}; default: ${5:0.5}}>',
};

describe('channelBeforeComment', () => {
  it('reads the channel from a chnget before the comment', () => {
    expect(channelBeforeComment('kCut chnget "cutoff" ')).toBe('cutoff');
  });

  it('reads the channel from the functional chnget:k form', () => {
    expect(channelBeforeComment('kA = chnget:k("amp") ')).toBe('amp');
  });

  it('reads the channel from a chnset', () => {
    expect(channelBeforeComment('chnset kValue, "foo" ')).toBe('foo');
    expect(channelBeforeComment('chnset:k(kValue, "bar") ')).toBe('bar');
  });

  it('returns null when the line has no channel opcode', () => {
    expect(channelBeforeComment('kA = 1 ')).toBeNull();
    expect(channelBeforeComment('')).toBeNull();
  });
});

describe('humanize', () => {
  it('capitalises a plain channel name', () => {
    expect(humanize('cutoff')).toBe('Cutoff');
    expect(humanize('amp')).toBe('Amp');
  });

  it('strips a Csound type prefix, splits camelCase and separators', () => {
    expect(humanize('kCutoffFreq')).toBe('Cutoff Freq');
    expect(humanize('g_filter-cutoff')).toBe('Filter cutoff');
  });
});

describe('fillTemplate', () => {
  it('fills id, label and channel from a channel name', () => {
    expect(fillTemplate(KNOB_TEMPLATE, 'cutoff', '')).toBe(
      'knob:{id: "${1:knob_cutoff}"; label: "${2:Cutoff}"; channel: "${3:cutoff}"; range: ${4:0-1}; default: ${5:0.5}}>',
    );
  });

  it('uses neutral placeholders when there is no channel', () => {
    expect(fillTemplate(KNOB_TEMPLATE, null, '')).toBe(
      'knob:{id: "${1:knob_1}"; label: "${2:Label}"; channel: "${3:channel}"; range: ${4:0-1}; default: ${5:0.5}}>',
    );
  });

  it('avoids an id that already exists in the document', () => {
    expect(fillTemplate(KNOB_TEMPLATE, 'cutoff', 'id: "knob_cutoff"')).toContain(
      'id: "${1:knob_cutoff_2}"',
    );
  });

  it('keeps bumping the suffix until the id is unique', () => {
    const doc = 'id: "knob_cutoff"\nid: "knob_cutoff_2"';
    expect(fillTemplate(KNOB_TEMPLATE, 'cutoff', doc)).toContain('id: "${1:knob_cutoff_3}"');
  });
});

describe('metaCompletionSource: widget templates', () => {
  it('offers knob and prefills it from a preceding chnget', () => {
    const doc = 'kCut chnget "cutoff" ; <@WIDGET kn';
    const result = metaCompletionSource(makeContext(doc));
    expect(result).not.toBeNull();
    expect(result!.from).toBe(doc.length - 2);
    expect(result!.options.map((option) => option.label)).toEqual(['knob']);

    const knob = result!.options[0];
    expect(knob.detail).toBe('rotary control');
    expect(knob.type).toBe('class');
    expect(typeof knob.apply).toBe('function');

    expect(applyOption(doc, doc.length, result!, 'knob')).toBe(
      'kCut chnget "cutoff" ; <@WIDGET knob:{id: "knob_cutoff"; label: "Cutoff"; channel: "cutoff"; range: 0-1; default: 0.5}>',
    );
  });

  it('suffixes the generated id when the document already uses it', () => {
    const firstLine = 'kCut chnget "cutoff" ; <@WIDGET kn';
    const doc = `${firstLine}\n; existing id: "knob_cutoff"`;
    const result = metaCompletionSource(makeContext(doc, firstLine.length))!;

    expect(applyOption(doc, firstLine.length, result, 'knob')).toBe(
      'kCut chnget "cutoff" ; <@WIDGET knob:{id: "knob_cutoff_2"; label: "Cutoff"; channel: "cutoff"; range: 0-1; default: 0.5}>\n; existing id: "knob_cutoff"',
    );
  });

  it('lists every widget type after "<@WIDGET "', () => {
    const doc = 'kA = chnget:k("amp") ; <@WIDGET ';
    const result = metaCompletionSource(makeContext(doc))!;
    expect(result.from).toBe(doc.length);
    expect(result.options.map((option) => option.label)).toEqual([
      'knob',
      'slider',
      'button',
      'checkbox',
      'toggle',
      'dropdown',
      'xypad',
      'meter',
      'midi_keyboard',
      'label',
    ]);
  });

  it('prefills a channel-bound widget from functional chnget:k syntax', () => {
    const doc = 'kA = chnget:k("amp") ; <@WIDGET ';
    const result = metaCompletionSource(makeContext(doc))!;
    expect(applyOption(doc, doc.length, result, 'knob')).toBe(
      'kA = chnget:k("amp") ; <@WIDGET knob:{id: "knob_amp"; label: "Amp"; channel: "amp"; range: 0-1; default: 0.5}>',
    );
  });

  it('does not prefill a channel for widgets without a channel property', () => {
    const doc = 'kA = chnget:k("amp") ; <@WIDGET ';
    const result = metaCompletionSource(makeContext(doc))!;
    expect(applyOption(doc, doc.length, result, 'xypad')).toBe(
      'kA = chnget:k("amp") ; <@WIDGET xypad:{id: "xy_1"; label: "XY"; channel_x: "x"; channel_y: "y"; range_x: 0-1; range_y: 0-1}>',
    );
  });

  it('filters widget types by the typed prefix, case-insensitively', () => {
    expect(metaCompletionSource(makeContext('; <@WIDGET s'))!.options.map((o) => o.label)).toEqual([
      'slider',
    ]);
    expect(metaCompletionSource(makeContext('; <@WIDGET KN'))!.options.map((o) => o.label)).toEqual([
      'knob',
    ]);
  });
});

describe('metaCompletionSource: <@WIDGET / <@INSTRUMENT', () => {
  it('offers both meta-opcodes after "<@"', () => {
    const doc = '  ; <@';
    const result = metaCompletionSource(makeContext(doc))!;
    expect(result.from).toBe(doc.length - 2);
    expect(result.options.map((option) => option.label)).toEqual(['<@WIDGET', '<@INSTRUMENT']);
    expect(result.options.map((option) => option.detail)).toEqual([
      'add a control to the widget board',
      'name, description and tags for the portfolio',
    ]);
  });

  it('inserts the widget opener as plain text', () => {
    const doc = '  ; <@';
    const result = metaCompletionSource(makeContext(doc))!;
    const widget = result.options.find((option) => option.label === '<@WIDGET')!;
    expect(widget.apply).toBe('<@WIDGET ');
  });

  it('inserts a filled instrument snippet', () => {
    const doc = '  ; <@';
    const result = metaCompletionSource(makeContext(doc))!;
    expect(applyOption(doc, doc.length, result, '<@INSTRUMENT')).toBe(
      '  ; <@INSTRUMENT: {name: "Name"; author: "Author"; description: "One line about the sound"; tags: "synth, pad"}>',
    );
  });

  it('returns null outside a comment', () => {
    expect(metaCompletionSource(makeContext('kCut chnget "cutoff" <@WIDGET kn'))).toBeNull();
    expect(metaCompletionSource(makeContext('kCut = 1'))).toBeNull();
  });

  // BUGS FOUND (1): the ";" here is inside a string literal, not a comment,
  // so no meta completion should be offered. Actual: the source treats any
  // text after the ";" as a comment and offers "knob".
  it('does not offer meta completions when the ";" is inside a string', () => {
    expect(metaCompletionSource(makeContext('S s = "x; <@WIDGET kn'))).toBeNull();
  });
});

describe('opcodeCompletionSource', () => {
  it('offers oscili for a typed opcode prefix', () => {
    const doc = 'a1 osci';
    const result = opcodeCompletionSource(makeContext(doc))!;
    expect(result.from).toBe(3);
    const oscili = result.options.find((option) => option.label === 'oscili');
    expect(oscili).toBeDefined();
    expect(oscili!.detail).toBe('ares oscili xamp, xcps[, ifn, iphs]');
    expect(oscili!.info).toContain('oscillator');
  });

  it('offers keywords as well as opcodes', () => {
    const result = opcodeCompletionSource(makeContext('instr 1\nif os'))!;
    const labels = result.options.map((option) => option.label);
    expect(labels).toContain('if');
    expect(labels).toContain('oscili');
  });

  it('returns null inside a ; comment', () => {
    expect(opcodeCompletionSource(makeContext('; a1 osci'))).toBeNull();
  });

  it('returns null inside a // comment', () => {
    expect(opcodeCompletionSource(makeContext('a1 oscili // osci'))).toBeNull();
  });

  it('returns null inside a string', () => {
    expect(opcodeCompletionSource(makeContext('a1 "osci'))).toBeNull();
  });

  it('does not trigger on a single typed character unless explicit', () => {
    expect(opcodeCompletionSource(makeContext('a1 o'))).toBeNull();
    const explicit = opcodeCompletionSource(makeContext('a1 o', 4, true))!;
    expect(explicit.from).toBe(3);
    expect(explicit.options.some((option) => option.label === 'oscili')).toBe(true);
  });

  it('returns null when there is no word to complete', () => {
    expect(opcodeCompletionSource(makeContext('a1 '))).toBeNull();
  });

  // BUGS FOUND (2): block comments are comments in the Csound tokenizer, but
  // inCommentOrString() only recognises ";" and "//". Actual: a full opcode
  // completion list is returned inside "/* ... */".
  it('does not offer opcode completions inside a block comment', () => {
    expect(opcodeCompletionSource(makeContext('a1 = /* osci'))).toBeNull();
  });
});
