import { describe, expect, it } from 'vitest';
import { getSection, isCsd, stripComments } from '../../player/engine/csdText';

const lineCount = (text: string): number => text.split('\n').length;
const newlineCount = (text: string): number => (text.match(/\n/g) ?? []).length;

const FULL_CSD = [
  '<CsoundSynthesizer>',
  '<CsInstruments>',
  'instr 1',
  '  out 1',
  'endin',
  '</CsInstruments>',
  '<CsScore>',
  'i1 0 1',
  '</CsScore>',
  '</CsoundSynthesizer>',
].join('\n');

describe('getSection', () => {
  it('returns the inner text of a section', () => {
    expect(getSection(FULL_CSD, 'CsInstruments')).toBe('\ninstr 1\n  out 1\nendin\n');
  });

  it('returns the inner text of a later section too', () => {
    expect(getSection(FULL_CSD, 'CsScore')).toBe('\ni1 0 1\n');
  });

  it('returns null when the tag is missing', () => {
    expect(getSection(FULL_CSD, 'CsOptions')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(getSection('', 'CsInstruments')).toBeNull();
  });

  it('is case-insensitive for the tag', () => {
    expect(getSection('<CSINSTRUMENTS>abc</csinstruments>', 'CsInstruments')).toBe('abc');
    expect(getSection('<csinstruments>abc</CSINSTRUMENTS>', 'csinstruments')).toBe('abc');
  });

  it('accepts attributes on the opening tag', () => {
    expect(getSection('<CsInstruments gain="1" foo>\nabc\n</CsInstruments>', 'CsInstruments')).toBe('\nabc\n');
  });

  it('returns the first section when the tag is repeated', () => {
    expect(getSection('<CsScore>first</CsScore><CsScore>second</CsScore>', 'CsScore')).toBe('first');
  });

  it('returns an empty string for an empty section', () => {
    expect(getSection('<CsScore></CsScore>', 'CsScore')).toBe('');
  });

  it('does not match a tag that only shares a prefix', () => {
    expect(getSection('<CsInstrumentsExtra>abc</CsInstrumentsExtra>', 'CsInstruments')).toBeNull();
  });

  it('returns null when the section is not closed', () => {
    expect(getSection('<CsInstruments>\ninstr 1\nendin', 'CsInstruments')).toBeNull();
  });

  it('preserves CRLF line endings in the returned text', () => {
    const csd = '<CsInstruments>\r\ninstr 1\r\nendin\r\n</CsInstruments>';
    expect(getSection(csd, 'CsInstruments')).toBe('\r\ninstr 1\r\nendin\r\n');
  });
});

describe('isCsd', () => {
  it('accepts a CSD with both required sections', () => {
    expect(isCsd(FULL_CSD)).toBe(true);
  });

  it('accepts the minimal pair of sections', () => {
    expect(isCsd('<CsoundSynthesizer><CsInstruments></CsInstruments></CsoundSynthesizer>')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isCsd('<csoundsynthesizer>\n<CSINSTRUMENTS>\n</CSINSTRUMENTS>')).toBe(true);
  });

  it('rejects text without CsInstruments', () => {
    expect(isCsd('<CsoundSynthesizer>\n<CsScore>\n</CsScore>\n</CsoundSynthesizer>')).toBe(false);
  });

  it('rejects text without CsoundSynthesizer', () => {
    expect(isCsd('<CsInstruments>\ninstr 1\nendin\n</CsInstruments>')).toBe(false);
  });

  it('rejects empty text', () => {
    expect(isCsd('')).toBe(false);
  });

  it('rejects an ordinary orchestra file', () => {
    expect(isCsd('instr 1\n  out 1\nendin\n')).toBe(false);
  });
});

describe('stripComments', () => {
  it('removes a semicolon comment but keeps the code before it', () => {
    expect(stripComments('instr 1 ; comment\n  out 1\nendin')).toBe('instr 1 \n  out 1\nendin');
  });

  it('removes a semicolon comment at end of input', () => {
    expect(stripComments('a = 1 ; comment')).toBe('a = 1 ');
  });

  it('removes a double-slash comment but keeps the code before it', () => {
    expect(stripComments('a // comment\nb')).toBe('a \nb');
  });

  it('removes a one-line block comment', () => {
    expect(stripComments('a /* comment */ b')).toBe('a  b');
  });

  it('keeps the newlines of a multi-line block comment', () => {
    const input = 'a /* one\ntwo\nthree */ b';
    const output = stripComments(input);
    expect(output).toBe('a \n\n b');
    expect(newlineCount(output)).toBe(newlineCount(input));
  });

  it('removes consecutive block comments', () => {
    expect(stripComments('a /* one */ /* two\nlines */ b')).toBe('a  \n b');
  });

  it('keeps the line count of a file mixing every comment style', () => {
    const input = [
      'instr 1 ; one',
      '  S "a;b // c /* d */"',
      '  ; two',
      '  /* block',
      '     comment */',
      '  {{',
      '    ; kept',
      '  }}',
      '  // three',
      'endin',
    ].join('\n');
    const output = stripComments(input);
    expect(lineCount(output)).toBe(lineCount(input));
    expect(output).toContain('"a;b // c /* d */"');
    expect(output).toContain('; kept');
    expect(output).not.toContain('one');
    expect(output).not.toContain('block');
    expect(output).not.toContain('three');
  });

  it('keeps semicolons inside a double-quoted string', () => {
    expect(stripComments('S "a;b" ; removed')).toBe('S "a;b" ');
  });

  it('keeps // and /* */ inside a double-quoted string', () => {
    const input = 'S "a // b /* c */ d"';
    expect(stripComments(input)).toBe(input);
  });

  it('keeps escaped quotes inside a string', () => {
    const input = String.raw`S "a\"b;c" ; removed`;
    expect(stripComments(input)).toBe(String.raw`S "a\"b;c" `);
  });

  it('keeps a string that ends with an escaped backslash', () => {
    const input = String.raw`S "a\\" ; removed`;
    expect(stripComments(input)).toBe(String.raw`S "a\\" `);
  });

  it('keeps a multi-line {{ ... }} string verbatim', () => {
    const input = [
      'a',
      '{{',
      '; not a comment',
      '// nor this',
      '/* nor this */',
      '"quoted"',
      '}}',
      'b ; real comment',
    ].join('\n');
    expect(stripComments(input)).toBe(
      ['a', '{{', '; not a comment', '// nor this', '/* nor this */', '"quoted"', '}}', 'b '].join('\n'),
    );
  });

  it('keeps an inline {{ ... }} string verbatim', () => {
    expect(stripComments('{{ a ; b // c /* d */ }}')).toBe('{{ a ; b // c /* d */ }}');
  });

  it('removes comments that follow a {{ ... }} string', () => {
    expect(stripComments('{{ a }} ; c\nb')).toBe('{{ a }} \nb');
  });

  it('ignores comment markers inside a block comment', () => {
    expect(stripComments('a /* " ; {{ // */ b')).toBe('a  b');
  });

  it('removes a comment-only input', () => {
    expect(stripComments('; a\n// b\n/* c */')).toBe('\n\n');
  });

  it('returns an empty string for empty input', () => {
    expect(stripComments('')).toBe('');
  });

  it('handles an unterminated block comment without throwing', () => {
    const input = 'a /* b\nc';
    const output = stripComments(input);
    expect(output).toBe('a \n');
    expect(lineCount(output)).toBe(lineCount(input));
  });

  it('keeps an unterminated string literal intact', () => {
    expect(stripComments('S "abc;def')).toBe('S "abc;def');
  });

  it('resumes parsing comments after an unterminated string line', () => {
    const input = 'S "abc\n; real comment\nx';
    const output = stripComments(input);
    expect(output).toBe('S "abc\n\nx');
    expect(lineCount(output)).toBe(lineCount(input));
  });

  it('does not treat division as a comment', () => {
    expect(stripComments('a = b / c\n')).toBe('a = b / c\n');
  });

  it('preserves CRLF line endings of code and the line count', () => {
    const input = '; one\r\na = 1\r\n// two\r\nb = 2';
    const output = stripComments(input);
    expect(output).toBe('\na = 1\r\n\nb = 2');
    expect(lineCount(output)).toBe(lineCount(input));
  });

  it('keeps the newline of a multi-line block comment written with CRLF', () => {
    const input = 'a /* one\r\ntwo */ b';
    const output = stripComments(input);
    expect(output).toBe('a \n b');
    expect(lineCount(output)).toBe(lineCount(input));
  });

  it('does not remove a lone slash or asterisk', () => {
    expect(stripComments('a / b * c')).toBe('a / b * c');
  });
});
