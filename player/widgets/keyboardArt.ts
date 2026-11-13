/**
 * A piano keyboard drawn with box-drawing characters (the man page's text keyboard):
 *
 *   ┌───────────────────────────┐
 *   │  ███ ███  │  ███ ███ ███  │
 *   │  ███ ███  │  ███ ███ ███  │
 *   │  ███ ███  │  ███ ███ ███  │
 *   │   │   │   │   │   │   │   │
 *   │C3 │   │   │   │   │   │   │
 *   └───┴───┴───┴───┴───┴───┴───┘
 *
 * Every white key is WHITE_COLS characters wide (its left edge included); black keys
 * are three characters centred on the edge between two white keys. Pressed keys are
 * marked so the component can colour them.
 */

export const WHITE_COLS = 4;
/** Rows of the drawing: top edge, three black-key rows, two white rows, bottom edge. */
export const ART_ROWS = 7;

export interface ArtCell {
  ch: string;
  /** Part of a pressed key. */
  on: boolean;
}

export function keyboardArt(
  whites: number[],
  blacks: { note: number; whiteBefore: number }[],
  active: ReadonlySet<number>,
  label: (note: number) => string | null,
): ArtCell[][] {
  const cols = whites.length * WHITE_COLS + 1;
  const blackAt = new Map<number, number>(); // column → note
  for (const { note, whiteBefore } of blacks) {
    const centre = whiteBefore * WHITE_COLS;
    for (let c = centre - 1; c <= centre + 1; c++) if (c > 0 && c < cols - 1) blackAt.set(c, note);
  }
  const whiteAt = (c: number) => whites[Math.min(whites.length - 1, Math.floor(c / WHITE_COLS))];
  const edge = (c: number) => c % WHITE_COLS === 0;

  const rows: ArtCell[][] = [];
  // Top edge.
  rows.push(
    Array.from({ length: cols }, (_, c) => ({
      ch: c === 0 ? '┌' : c === cols - 1 ? '┐' : edge(c) && !blackAt.has(c) ? '┬' : '─',
      on: false,
    })),
  );
  // Black keys over the upper part of the white keys.
  for (let r = 0; r < 3; r++) {
    rows.push(
      Array.from({ length: cols }, (_, c) => {
        const black = blackAt.get(c);
        if (black !== undefined) return { ch: active.has(black) ? '▒' : '█', on: active.has(black) };
        if (edge(c)) return { ch: '│', on: false };
        const white = whiteAt(c);
        return { ch: active.has(white) ? '░' : ' ', on: active.has(white) };
      }),
    );
  }
  // Lower part of the white keys; the last row carries the C labels.
  for (let r = 0; r < 2; r++) {
    const row: ArtCell[] = Array.from({ length: cols }, (_, c) => {
      if (edge(c)) return { ch: '│', on: false };
      const white = whiteAt(c);
      return { ch: active.has(white) ? '░' : ' ', on: active.has(white) };
    });
    if (r === 1) {
      whites.forEach((note, i) => {
        const text = label(note);
        if (!text) return;
        [...text.slice(0, WHITE_COLS - 1)].forEach((ch, j) => {
          row[i * WHITE_COLS + 1 + j] = { ch, on: active.has(note) };
        });
      });
    }
    rows.push(row);
  }
  // Bottom edge.
  rows.push(
    Array.from({ length: cols }, (_, c) => ({
      ch: c === 0 ? '└' : c === cols - 1 ? '┘' : edge(c) ? '┴' : '─',
      on: false,
    })),
  );
  return rows;
}

/** Plain text of a drawing (tests, debugging). */
export function artText(rows: ArtCell[][]): string {
  return rows.map((row) => row.map((cell) => cell.ch).join('')).join('\n');
}
