import { describe, expect, it } from 'vitest';
import {
  MANUAL_BASE_URL,
  OPCODE_NAMES,
  allOpcodes,
  lookupOpcode,
  manualUrl,
} from '../../player/editor/opcodeCatalog';

describe('lookupOpcode', () => {
  it('returns the catalogue entry for a known opcode', () => {
    const entry = lookupOpcode('oscili');
    expect(entry).toBeDefined();
    expect(entry!.name).toBe('oscili');
    expect(entry!.purpose).toBeTruthy();
    expect(entry!.syntax!.length).toBeGreaterThan(0);
    expect(entry!.syntax![0]).toContain('oscili');
    expect(entry!.file).toBe('oscili.html');
  });

  it('is case-insensitive and keeps the catalogue spelling of the name', () => {
    expect(lookupOpcode('OSCILI')!.name).toBe('oscili');
    expect(lookupOpcode('OsCiLi')).toEqual(lookupOpcode('oscili'));
    expect(lookupOpcode('OUT')!.name).toBe('out');
  });

  it('falls back from a packed _i name to the parent opcode', () => {
    const packed = lookupOpcode('turnoff2_i');
    expect(packed).toBeDefined();
    expect(packed!.name).toBe('turnoff2');
    expect(packed).toEqual(lookupOpcode('turnoff2'));
  });

  it('is case-insensitive for the _i fallback too', () => {
    expect(lookupOpcode('TURNOFF2_I')!.name).toBe('turnoff2');
  });

  it('returns undefined for unknown opcodes', () => {
    expect(lookupOpcode('definitely_not_an_opcode')).toBeUndefined();
    expect(lookupOpcode('')).toBeUndefined();
  });

  it('returns undefined when an unknown _i name has no parent', () => {
    expect(lookupOpcode('notarealopcode_i')).toBeUndefined();
  });
});

describe('OPCODE_NAMES', () => {
  it('contains opcode names with their original spelling', () => {
    expect(OPCODE_NAMES.has('oscili')).toBe(true);
    expect(OPCODE_NAMES.has('turnoff2')).toBe(true);
    expect(OPCODE_NAMES.has('outs')).toBe(true);
  });

  it('excludes score statements and other raw keys that contain spaces', () => {
    const withSpaces = [...OPCODE_NAMES].filter((name) => /\s/.test(name));
    expect(withSpaces).toEqual([]);
    expect(OPCODE_NAMES.has('a Statement (or Advance Statement)')).toBe(false);
  });

  it('matches the names exposed by allOpcodes()', () => {
    const names = allOpcodes().map((entry) => entry.name);
    expect(names).toHaveLength(OPCODE_NAMES.size);
    expect(new Set(names)).toEqual(new Set(OPCODE_NAMES));
  });
});

describe('manualUrl', () => {
  it('builds the Csound manual URL from the file field', () => {
    expect(manualUrl(lookupOpcode('oscili')!)).toBe(
      'https://csound.com/docs/manual/oscili.html',
    );
    expect(MANUAL_BASE_URL).toBe('https://csound.com/docs/manual/');
  });

  it('returns undefined when the entry has no manual file', () => {
    expect(manualUrl({ name: 'mystery' })).toBeUndefined();
    expect(manualUrl({ name: 'mystery', file: '' })).toBeUndefined();
  });

  it('appends the file name verbatim', () => {
    expect(manualUrl({ name: 'x', file: 'sub/page.html' })).toBe(
      'https://csound.com/docs/manual/sub/page.html',
    );
  });
});
