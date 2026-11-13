/** Release timeline: instruments grouped by year, newest first (pure, for tests). */
import type { InstrumentEntry } from './config';

export interface TimelineGroup {
  /** "2026", or "Undated" for instruments without a date. */
  label: string;
  items: InstrumentEntry[];
}

/** Sort key: "2026" → "2026-00-00", "2026-03" → "2026-03-00", so finer dates sort after coarser ones of the same period. */
export function dateKey(date: string): string {
  const [y, m = '00', d = '00'] = date.split('-');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function hasDates(instruments: InstrumentEntry[]): boolean {
  return instruments.some((i) => Boolean(i.date));
}

export function timelineGroups(instruments: InstrumentEntry[]): TimelineGroup[] {
  const dated = instruments
    .filter((i) => i.date)
    .sort((a, b) => dateKey(b.date!).localeCompare(dateKey(a.date!)) || a.title.localeCompare(b.title));
  const groups: TimelineGroup[] = [];
  for (const instrument of dated) {
    const year = instrument.date!.slice(0, 4);
    const last = groups.at(-1);
    if (last?.label === year) last.items.push(instrument);
    else groups.push({ label: year, items: [instrument] });
  }
  const undated = instruments.filter((i) => !i.date);
  if (undated.length) groups.push({ label: 'Undated', items: undated });
  return groups;
}
