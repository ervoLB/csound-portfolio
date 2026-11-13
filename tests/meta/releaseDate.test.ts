import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../player/meta/manifest';
import { parseInstrument, parseReleaseDate } from '../../player/meta/parseInstrument';
import { dateKey, hasDates, timelineGroups } from '../../site/timeline';
import type { InstrumentEntry } from '../../site/config';

const csd = (meta: string) =>
  `<CsoundSynthesizer>\n<CsInstruments>\n;<@INSTRUMENT: {${meta}}>\ninstr 1\nendin\n</CsInstruments>\n<CsScore>\n</CsScore>\n</CsoundSynthesizer>`;

describe('parseReleaseDate', () => {
  it('accepts a year, a month or a day and normalises padding', () => {
    expect(parseReleaseDate('2026')).toBe('2026');
    expect(parseReleaseDate('2026-3')).toBe('2026-03');
    expect(parseReleaseDate(' 2026-03-04 ')).toBe('2026-03-04');
    expect(parseReleaseDate('2024-02-29')).toBe('2024-02-29'); // leap year
  });

  it('rejects impossible or other formats', () => {
    for (const bad of ['2026-13', '2026-00', '2025-02-29', '2026-04-31', '26-01', '2026/03/01', 'March 2026', '', '2026-03-01T10:00']) {
      expect(parseReleaseDate(bad), bad).toBeNull();
    }
  });
});

describe('@INSTRUMENT date', () => {
  it('is read quoted or unquoted', () => {
    expect(parseInstrument(csd('name: "A"; date: "2026-03-14"')).meta?.date).toBe('2026-03-14');
    expect(parseInstrument(csd('name: "A"; date: 2025-09')).meta?.date).toBe('2025-09');
  });

  it('warns about an invalid date and leaves it out', () => {
    const result = parseInstrument(csd('name: "A"; date: "14.03.2026"'));
    expect(result.meta?.date).toBeUndefined();
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', message: expect.stringContaining('date must look like') })]);
  });

  it('reaches instruments.json', () => {
    const { manifest, problems } = buildManifest([
      { slug: 'a', csd: 'instruments/a.csd', text: csd('name: "A"; date: "2026-03"') },
      { slug: 'b', csd: 'instruments/b.csd', text: csd('name: "B"') },
    ]);
    expect(problems).toEqual([]);
    expect(manifest.instruments.find((i) => i.slug === 'a')?.date).toBe('2026-03');
    expect(manifest.instruments.find((i) => i.slug === 'b')).not.toHaveProperty('date');
  });
});

describe('timeline', () => {
  const entry = (slug: string, date?: string, title = slug): InstrumentEntry => ({
    slug,
    title,
    tags: [],
    type: 'synth',
    csd: `instruments/${slug}.csd`,
    widgets: 0,
    midi: false,
    ...(date ? { date } : {}),
  });

  it('groups by year, newest first, finer dates after coarser ones, undated last', () => {
    const groups = timelineGroups([
      entry('old', '2024-05'),
      entry('undated'),
      entry('year', '2026'),
      entry('day', '2026-03-14'),
      entry('month', '2026-03'),
      entry('mid', '2025-09'),
    ]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.slug)])).toEqual([
      ['2026', ['day', 'month', 'year']],
      ['2025', ['mid']],
      ['2024', ['old']],
      ['Undated', ['undated']],
    ]);
  });

  it('orders equal dates by title and reports whether any date exists', () => {
    const groups = timelineGroups([entry('b', '2026', 'Bravo'), entry('a', '2026', 'Alpha')]);
    expect(groups[0].items.map((i) => i.title)).toEqual(['Alpha', 'Bravo']);
    expect(hasDates([entry('x')])).toBe(false);
    expect(hasDates([entry('x'), entry('y', '2026')])).toBe(true);
    expect(timelineGroups([])).toEqual([]);
  });

  it('builds sortable keys', () => {
    expect(dateKey('2026')).toBe('2026-00-00');
    expect(dateKey('2026-03')).toBe('2026-03-00');
    expect(dateKey('2026-03-14')).toBe('2026-03-14');
  });
});
