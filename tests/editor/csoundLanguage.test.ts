import { describe, expect, it } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { csound } from '../../player/editor/csoundLanguage';

interface Token {
  name: string;
  text: string;
  from: number;
  to: number;
}

/** Parse `doc` with the Csound stream language and list every syntax node. */
function tokens(doc: string): Token[] {
  const state = EditorState.create({ doc, extensions: [csound()] });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  expect(tree).not.toBeNull();
  const out: Token[] = [];
  tree!.iterate({
    enter(node) {
      out.push({
        name: node.name,
        text: doc.slice(node.from, node.to),
        from: node.from,
        to: node.to,
      });
    },
  });
  return out;
}

/** All nodes whose source text is exactly `text`. */
function tokensOf(doc: string, text: string): Token[] {
  return tokens(doc).filter((token) => token.text === text);
}

function nameOf(doc: string, text: string): string | undefined {
  const found = tokensOf(doc, text);
  expect(found).toHaveLength(1);
  return found[0].name;
}

describe('Csound stream tokenizer', () => {
  it('emits a Document node covering the whole text', () => {
    const doc = 'instr 1\nendin';
    const all = tokens(doc);
    expect(all[0]).toMatchObject({ name: 'Document', from: 0, to: doc.length });
  });

  it('marks instr / endin as keywords', () => {
    expect(nameOf('instr 1\nendin', 'instr')).toBe('keyword');
    expect(nameOf('instr 1\nendin', 'endin')).toBe('keyword');
    expect(nameOf('sr = 48000', 'sr')).toBe('keyword');
  });

  it('marks catalogue opcodes as functions', () => {
    const doc = 'a1 oscili 440\nkA = chnget:k("amp")';
    expect(nameOf(doc, 'oscili')).toBe('function');
    expect(nameOf(doc, 'chnget:k')).toBe('function');
  });

  it('marks string literals as strings', () => {
    const doc = 'Sname = "hello world"';
    const strings = tokens(doc).filter((token) => token.name === 'string');
    expect(strings.map((token) => token.text)).toEqual(['"hello world"']);
  });

  it('marks line comments as comments', () => {
    const doc = '; this is a comment';
    const comments = tokens(doc).filter((token) => token.name === 'comment');
    expect(comments.map((token) => token.text)).toEqual(['; this is a comment']);
  });

  it('marks // comments as comments too', () => {
    const doc = 'a1 oscili 440 // trailing note';
    const comments = tokens(doc).filter((token) => token.name === 'comment');
    expect(comments.map((token) => token.text)).toEqual(['// trailing note']);
  });

  it('gives a meta-opcode inside a comment its own "meta" token', () => {
    const doc = '  ; <@WIDGET knob:{id: "k"}>';
    const all = tokens(doc);
    const comments = all.filter((token) => token.name === 'comment');
    const metas = all.filter((token) => token.name === 'meta');
    expect(comments.map((token) => token.text)).toEqual(['; ']);
    expect(metas.map((token) => token.text)).toEqual(['<@WIDGET knob:{id: "k"}>']);
  });

  it('marks a block comment spanning lines as comment tokens', () => {
    const doc = 'a1 oscili /* block\ncomment */ 1';
    const comments = tokens(doc).filter((token) => token.name === 'comment');
    expect(comments.map((token) => token.text)).toEqual(['/* block', 'comment */']);
  });

  it('marks a multi-line string spanning lines as string tokens', () => {
    const doc = 'Stext = {{ multi\nline }}';
    const strings = tokens(doc).filter((token) => token.name === 'string');
    expect(strings.map((token) => token.text)).toEqual(['{{ multi', 'line }}']);
  });

  it('marks decimal and exponent numbers as numbers', () => {
    const doc = 'a1 oscili 0.5, 1e-3';
    const numbers = tokens(doc).filter((token) => token.name === 'number');
    expect(numbers.map((token) => token.text)).toEqual(['0.5', '1e-3']);
  });

  it('marks p-fields as special', () => {
    expect(nameOf('kA = p4', 'p4')).toBe('special');
  });

  it('marks CSD tags as tagName, including attributes and closing tags', () => {
    const doc = [
      '<CsoundSynthesizer>',
      '<CsOptions tempo="60">',
      '<CsInstruments>',
      '</CsInstruments>',
      '</CsoundSynthesizer>',
    ].join('\n');
    const tags = tokens(doc).filter((token) => token.name === 'tagName');
    expect(tags.map((token) => token.text)).toEqual([
      '<CsoundSynthesizer>',
      '<CsOptions tempo="60">',
      '<CsInstruments>',
      '</CsInstruments>',
      '</CsoundSynthesizer>',
    ]);
  });

  it('gives the token families distinct types', () => {
    const doc = [
      '<CsInstruments>',
      'instr 1',
      '  a1 oscili 0.5, 440 ; comment',
      '  Sname = "text"',
      '  ; <@WIDGET knob:{id: "k"}>',
      'endin',
      '</CsInstruments>',
    ].join('\n');
    const names = new Set(tokens(doc).map((token) => token.name));
    for (const expected of ['tagName', 'keyword', 'function', 'number', 'comment', 'string', 'meta']) {
      expect(names).toContain(expected);
    }
  });
});
