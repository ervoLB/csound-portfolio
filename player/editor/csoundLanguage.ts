/**
 * Csound syntax highlighting for CodeMirror 6 (stream tokenizer).
 * Colours come from `--cp-syn-*` CSS variables, so light and dark themes work.
 */
import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StreamParser } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { OPCODE_NAMES } from './opcodeCatalog';

export const KEYWORDS = new Set([
  'instr', 'endin', 'opcode', 'endop', 'if', 'then', 'else', 'elseif', 'endif', 'fi', 'ithen', 'kthen',
  'while', 'do', 'od', 'until', 'enduntil', 'goto', 'igoto', 'kgoto', 'return', 'void', 'struct',
  'sr', 'kr', 'ksmps', 'nchnls', 'nchnls_i', '0dbfs', 'A4',
]);

const CSD_TAG_RE = /<\/?(CsoundSynthesizer|CsOptions|CsInstruments|CsScore|CsVersion|CsLicense|CsLicence|CsShortLicense|CsFileB|CsFile|CsSampleB|CsMidifileB)(\s[^>]*)?>/i;

interface State {
  inBlockComment: boolean;
  inMultilineString: boolean;
}

const parser: StreamParser<State> = {
  name: 'csound',
  startState: () => ({ inBlockComment: false, inMultilineString: false }),
  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.match(/.*?\*\//)) state.inBlockComment = false;
      else stream.skipToEnd();
      return 'comment';
    }
    if (state.inMultilineString) {
      if (stream.match(/.*?\}\}/)) state.inMultilineString = false;
      else stream.skipToEnd();
      return 'string';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('/*')) {
      state.inBlockComment = true;
      return 'comment';
    }
    if (stream.match('{{')) {
      state.inMultilineString = true;
      return 'string';
    }
    if (stream.match(CSD_TAG_RE)) return 'tagName';
    // Comments, with meta-opcodes (<@WIDGET …>, <@INSTRUMENT …>) highlighted inside them.
    if (stream.peek() === ';' || stream.match('//', false)) {
      const rest = stream.string.slice(stream.pos);
      const meta = rest.indexOf('<@');
      if (meta > 0) {
        stream.pos += meta;
        return 'comment';
      }
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match(/<@[^>]*>?/)) return 'meta';
    if (stream.match(/"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/#(define|include|undef|ifdef|ifndef|else|end|includestr)\b/)) return 'keyword';
    if (stream.match(/\$\w+\.?/)) return 'macroName';
    if (stream.match(/0[xX][0-9a-fA-F]+/) || stream.match(/(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/)) return 'number';
    if (stream.match(/p\d+\b/)) return 'special';
    if (stream.match(/[A-Za-z_][A-Za-z0-9_]*(:[a-zA-Z]+)?/)) {
      const word = stream.current().split(':')[0];
      if (KEYWORDS.has(word)) return 'keyword';
      if (OPCODE_NAMES.has(word)) return 'function';
      if (/^g?[ikaSfwb][A-Za-z0-9_]/.test(word) || /^g?[ikaSfwb]$/.test(word)) return 'variableName';
      return null;
    }
    if (stream.match(/[+\-*/%=<>!&|^~?:#]+/)) return 'operator';
    if (stream.match(/[(){}[\]]/)) return 'bracket';
    if (stream.match(/,/)) return 'punctuation';
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: ';', block: { open: '/*', close: '*/' } },
    wordChars: '_',
  },
  tokenTable: {
    tagName: t.tagName,
    meta: t.meta,
    function: t.function(t.variableName),
    special: t.special(t.variableName),
    macroName: t.macroName,
  },
};

export const csoundLanguage = StreamLanguage.define(parser);

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--cp-syn-keyword)', fontWeight: '600' },
  { tag: t.tagName, color: 'var(--cp-syn-tag)', fontWeight: '600' },
  { tag: t.function(t.variableName), color: 'var(--cp-syn-opcode)' },
  { tag: t.variableName, color: 'var(--cp-syn-variable)' },
  { tag: t.special(t.variableName), color: 'var(--cp-syn-number)' },
  { tag: t.string, color: 'var(--cp-syn-string)' },
  { tag: t.number, color: 'var(--cp-syn-number)' },
  { tag: t.comment, color: 'var(--cp-syn-comment)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--cp-syn-meta)', backgroundColor: 'var(--cp-syn-meta-bg)', fontStyle: 'normal' },
  { tag: t.macroName, color: 'var(--cp-syn-keyword)' },
  { tag: t.operator, color: 'var(--cp-syn-operator)' },
  { tag: [t.bracket, t.punctuation], color: 'var(--cp-syn-operator)' },
]);

export function csound(): Extension[] {
  return [csoundLanguage, syntaxHighlighting(highlightStyle)];
}
