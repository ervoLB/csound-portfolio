import { describe, expect, it } from 'vitest';
import {
  ART_ROWS,
  WHITE_COLS,
  artText,
  keyboardArt,
} from '../../player/widgets/keyboardArt';

const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);

/** Build the whites/blacks arrays the way MidiKeyboard does for a note range. */
function range(start: number, end: number) {
  const notes: number[] = [];
  for (let note = start; note <= end; note++) notes.push(note);
  const whites = notes.filter((note) => !BLACK_PITCHES.has(note % 12));
  const blacks = notes
    .filter((note) => BLACK_PITCHES.has(note % 12))
    .map((note) => ({ note, whiteBefore: whites.filter((white) => white < note).length }));
  return { whites, blacks };
}

const octave = range(60, 72); // C4..C5

const oneOctave = [
  '┌───────────┬───────────────┬───┐',
  '│  ███ ███  │  ███ ███ ███  │   │',
  '│  ███ ███  │  ███ ███ ███  │   │',
  '│  ███ ███  │  ███ ███ ███  │   │',
  '│   │   │   │   │   │   │   │   │',
  '│   │   │   │   │   │   │   │   │',
  '└───┴───┴───┴───┴───┴───┴───┴───┘',
].join('\n');

describe('keyboardArt', () => {
  it('draws one octave C4..C5 as exact plain text', () => {
    const rows = keyboardArt(octave.whites, octave.blacks, new Set(), () => null);

    expect(octave.whites).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(octave.blacks).toEqual([
      { note: 61, whiteBefore: 1 },
      { note: 63, whiteBefore: 2 },
      { note: 66, whiteBefore: 4 },
      { note: 68, whiteBefore: 5 },
      { note: 70, whiteBefore: 6 },
    ]);
    expect(ART_ROWS).toBe(7);
    expect(rows).toHaveLength(7);
    for (const row of rows) expect(row).toHaveLength(octave.whites.length * WHITE_COLS + 1);
    expect(artText(rows)).toBe(oneOctave);
  });

  it('marks a pressed white key with ░ and on=true', () => {
    const rows = keyboardArt(octave.whites, octave.blacks, new Set([60]), () => null);

    // The first white key (C4) occupies columns 1..3; C#4 covers column 3 in the black-key rows.
    for (const r of [1, 2, 3]) {
      for (const c of [1, 2]) expect(rows[r][c]).toEqual({ ch: '░', on: true });
    }
    for (const c of [1, 2, 3]) expect(rows[4][c]).toEqual({ ch: '░', on: true });
    // Everything not pressed stays off.
    expect(rows[1][6]).toEqual({ ch: ' ', on: false });
  });

  it('marks a pressed black key with ▒ and on=true', () => {
    const rows = keyboardArt(octave.whites, octave.blacks, new Set([61]), () => null);

    // C#4 is drawn on the edge after the first white key: columns 3..5, rows 1..3.
    for (const r of [1, 2, 3]) {
      for (const c of [3, 4, 5]) expect(rows[r][c]).toEqual({ ch: '▒', on: true });
    }
    expect(rows[4][3]).toEqual({ ch: ' ', on: false });
  });

  it('draws labels only where the label callback returns text', () => {
    const rows = keyboardArt(octave.whites, octave.blacks, new Set(), (note) => (note === 60 ? 'C4' : null));

    expect(rows[5].map((cell) => cell.ch).join('')).toBe('│C4 │   │   │   │   │   │   │   │');
    for (const c of [5, 6, 7, 9, 10, 11, 13, 14, 15]) expect(rows[5][c]).toEqual({ ch: ' ', on: false });
  });

  it('leaves ignored labels blank', () => {
    const rows = keyboardArt(octave.whites, octave.blacks, new Set(), (note) => (note === 60 ? '' : null));
    expect(rows[5].map((cell) => cell.ch).join('')).toBe('│   │   │   │   │   │   │   │   │');
  });

  it('does not throw or put █ in column 0 for a range starting on a black key', () => {
    const { whites, blacks } = range(61, 64); // starts on C#4
    expect(whites).toEqual([62, 64]);
    expect(blacks[0]).toEqual({ note: 61, whiteBefore: 0 });

    let rows: ReturnType<typeof keyboardArt> | undefined;
    expect(() => {
      rows = keyboardArt(whites, blacks, new Set(), () => null);
    }).not.toThrow();

    expect(rows!.every((row) => row[0].ch !== '█')).toBe(true);
    expect(rows![0][0]).toEqual({ ch: '┌', on: false });
    expect(rows![1][1]).toEqual({ ch: '█', on: false });
  });
});
