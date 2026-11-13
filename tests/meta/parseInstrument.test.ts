import { describe, expect, it } from 'vitest';
import { parseInstrument } from '../../player/meta/parseInstrument';

describe('parseInstrument — full definition', () => {
  it('parses every field', () => {
    const code = `;<@INSTRUMENT: {name: "Sub Synth"; type: "synth"; author: "Lovre"; description: "A warm sub"; tags: "bass, synth, Bass"; license: "MIT"; midi: "on"; order: 2; draft: true}>`;
    const result = parseInstrument(code);
    expect(result.issues).toEqual([]);
    expect(result.line).toBe(1);
    expect(result.meta).toEqual({
      name: 'Sub Synth',
      type: 'synth',
      author: 'Lovre',
      description: 'A warm sub',
      tags: ['bass', 'synth'],
      license: 'MIT',
      midi: 'on',
      order: 2,
      draft: true,
    });
  });

  it('accepts whitespace around every punctuation mark', () => {
    const code = `;   <@INSTRUMENT   :   {  name :  "Spaced" ; type :  "effect"  }>`;
    const result = parseInstrument(code);
    expect(result.issues).toEqual([]);
    expect(result.meta).toMatchObject({ name: 'Spaced', type: 'effect' });
  });

  it('applies defaults for omitted fields', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "Bare"}>`);
    expect(result.issues).toEqual([]);
    expect(result.meta).toEqual({
      name: 'Bare',
      type: 'synth',
      tags: [],
      draft: false,
    });
  });

  it('records the 1-based line of the used definition', () => {
    const code = `; comment
instr 1
endin
;<@INSTRUMENT: {name: "Late"}>`;
    expect(parseInstrument(code).line).toBe(4);
  });

  it('returns null when there is no definition', () => {
    expect(parseInstrument('instr 1\nendin')).toEqual({ meta: null, issues: [] });
    expect(parseInstrument('')).toEqual({ meta: null, issues: [] });
  });
});

describe('parseInstrument — individual fields', () => {
  it('accepts type "effect"', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "FX"; type: "effect"}>`);
    expect(result.issues).toEqual([]);
    expect(result.meta?.type).toBe('effect');
  });

  it('warns about an invalid type and keeps "synth"', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "X"; type: "instrument"}>`);
    expect(result.meta?.type).toBe('synth');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning', line: 1 });
    expect(result.issues[0].message).toContain('type must be');
  });

  it('uses author and falls back to vendor', () => {
    expect(
      parseInstrument(`;<@INSTRUMENT: {name: "A"; vendor: "Vendor"}>`).meta?.author,
    ).toBe('Vendor');
    expect(
      parseInstrument(`;<@INSTRUMENT: {name: "A"; author: "Author"; vendor: "Vendor"}>`).meta
        ?.author,
    ).toBe('Author');
  });

  it('splits, trims and de-duplicates tags case-insensitively', () => {
    const result = parseInstrument(
      `;<@INSTRUMENT: {name: "T"; tags: " Bass , synth,,BASS , Pad "}>`,
    );
    expect(result.issues).toEqual([]);
    expect(result.meta?.tags).toEqual(['Bass', 'synth', 'Pad']);
  });

  it('warns when unquoted tags are split into a stray part', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "T"; tags: bass, synth}>`);
    expect(result.meta?.tags).toEqual(['bass']);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('warning');
    expect(result.issues[0].message).toBe('Put tags in quotes: tags: "a, b"');
  });

  it('emits only one tags warning for several unquoted values', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "T"; tags: a, b, c}>`);
    expect(result.meta?.tags).toEqual(['a']);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toBe('Put tags in quotes: tags: "a, b"');
  });

  it('accepts a single unquoted tag without warning', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "T"; tags: ambient}>`);
    expect(result.issues).toEqual([]);
    expect(result.meta?.tags).toEqual(['ambient']);
  });

  it('warns when name is missing instead of failing', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {type: "synth"}>`);
    expect(result.meta).toMatchObject({ type: 'synth' });
    expect(result.meta?.name).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning', line: 1 });
    expect(result.issues[0].message).toBe(
      '@INSTRUMENT has no name; the file name will be used',
    );
  });

  it.each([
    ['"on"', 'on'],
    ['"off"', 'off'],
    ['true', 'on'],
    ['false', 'off'],
  ])('maps midi %s to %s', (value, expected) => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "M"; midi: ${value}}>`);
    expect(result.issues).toEqual([]);
    expect(result.meta?.midi).toBe(expected);
  });

  it('warns about an invalid midi value and ignores it', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "M"; midi: "maybe"}>`);
    expect(result.meta?.midi).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('midi must be');
  });

  it.each([
    ['1', 1],
    ['-2.5', -2.5],
    ['"7"', 7],
  ])('parses order %s', (value, expected) => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "O"; order: ${value}}>`);
    expect(result.issues).toEqual([]);
    expect(result.meta?.order).toBe(expected);
  });

  it('warns about a non-numeric order and ignores it', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "O"; order: first}>`);
    expect(result.meta?.order).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('order must be a number');
  });

  it.each([
    ['true', true],
    ['false', false],
    ['"true"', true],
    ['"false"', false],
  ])('parses draft %s', (value, expected) => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "D"; draft: ${value}}>`);
    expect(result.issues).toEqual([]);
    expect(result.meta?.draft).toBe(expected);
  });

  it('warns about an invalid draft value and keeps false', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "D"; draft: yes}>`);
    expect(result.meta?.draft).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('draft must be true or false');
  });

  it('warns about unknown properties and ignores them', () => {
    const result = parseInstrument(
      `;<@INSTRUMENT: {name: "U"; colour: "red"; icon: "star"}>`,
    );
    expect(result.meta).toMatchObject({ name: 'U' });
    expect(result.issues.map((i) => i.message)).toEqual([
      'Unknown @INSTRUMENT property "colour"',
      'Unknown @INSTRUMENT property "icon"',
    ]);
    expect(result.issues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('warns about a malformed property part', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "P"; oops}>`);
    expect(result.meta).toMatchObject({ name: 'P' });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('Invalid property format');
  });
});

describe('parseInstrument — separators and quoting', () => {
  it('accepts comma-separated fields', () => {
    const result = parseInstrument(
      `;<@INSTRUMENT: {name: "Comma", type: "synth", author: "Me", description: "desc"}>`,
    );
    expect(result.issues).toEqual([]);
    expect(result.meta).toMatchObject({
      name: 'Comma',
      type: 'synth',
      author: 'Me',
      description: 'desc',
    });
  });

  it('keeps commas inside quoted values', () => {
    const result = parseInstrument(
      `;<@INSTRUMENT: {name: "D"; description: "drums, bass, strings"; tags: "a,b"}>`,
    );
    expect(result.issues).toEqual([]);
    expect(result.meta?.description).toBe('drums, bass, strings');
    expect(result.meta?.tags).toEqual(['a', 'b']);
  });

  it('ignores empty fields and empty values', () => {
    const result = parseInstrument(`;<@INSTRUMENT: {name: "E" ; ; description: }>`);
    expect(result.meta).toMatchObject({ name: 'E' });
    expect(result.meta?.description).toBeUndefined();
    expect(result.issues).toEqual([]);
  });
});

describe('parseInstrument — multiple definitions', () => {
  it('uses the first definition and reports every extra line', () => {
    const code = `;<@INSTRUMENT: {name: "First"; type: "synth"}>
instr 1
endin
;<@INSTRUMENT: {name: "Second"; type: "effect"}>
;<@INSTRUMENT: {name: "Third"}>`;
    const result = parseInstrument(code);
    expect(result.meta?.name).toBe('First');
    expect(result.line).toBe(1);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.map((i) => i.line)).toEqual([4, 5]);
    expect(result.issues.every((i) => i.severity === 'error')).toBe(true);
    expect(result.issues[0].message).toContain('Multiple @INSTRUMENT');
  });

  it('does not report an error when there is exactly one definition', () => {
    const result = parseInstrument(`instr 1\nendin\n;<@INSTRUMENT: {name: "Only"}>`);
    expect(result.issues).toEqual([]);
    expect(result.line).toBe(3);
  });
});
