/**
 * Builds instruments.json from the CSD files in instruments/. Pure functions so
 * the Vite plugin, the build script and tests share one implementation.
 */
import { isCsd } from '../engine/csdText';
import { detectMidi } from '../engine/midiDetect';
import { parseInstrument } from './parseInstrument';
import { parseWidgets } from './parseWidgets';

export const MANIFEST_VERSION = 1;

export interface ManifestEntry {
  slug: string;
  title: string;
  description?: string;
  tags: string[];
  author?: string;
  license?: string;
  type: 'synth' | 'effect';
  /** URL of the CSD relative to the site root, e.g. "instruments/fm-bells/fm-bells.csd". */
  csd: string;
  preview?: string;
  widgets: number;
  midi: boolean;
  order?: number;
  /** Release date from @INSTRUMENT: "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
  date?: string;
}

export interface Manifest {
  version: number;
  generatedAt: string;
  instruments: ManifestEntry[];
}

export interface InstrumentSource {
  slug: string;
  /** Site-relative URL of the CSD. */
  csd: string;
  text: string;
  /** Site-relative URL of a preview image, if the folder has one. */
  preview?: string;
}

export interface ManifestProblem {
  slug: string;
  file: string;
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}

/** "fm_bells" / "fm-bells" → "Fm bells". */
export function titleFromSlug(slug: string): string {
  const words = slug.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
}

export const PREVIEW_NAMES = ['preview.webp', 'preview.png', 'preview.jpg', 'preview.jpeg', 'preview.svg'];

export function buildManifest(sources: InstrumentSource[], now: Date = new Date()): { manifest: Manifest; problems: ManifestProblem[] } {
  const problems: ManifestProblem[] = [];
  const entries: ManifestEntry[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const report = (severity: ManifestProblem['severity'], message: string, line?: number) =>
      problems.push({ slug: source.slug, file: source.csd, severity, message, line });

    if (seen.has(source.slug)) {
      report('error', `Another instrument already uses the name "${source.slug}"; this one is skipped.`);
      continue;
    }
    if (!isCsd(source.text)) {
      report('error', 'Not a CSD file: it needs <CsoundSynthesizer> and <CsInstruments> sections. Skipped.');
      continue;
    }
    if (/\s/.test(source.slug)) report('warning', 'The folder or file name contains spaces; links to it will be harder to share.');

    const instrument = parseInstrument(source.text);
    const widgets = parseWidgets(source.text);
    for (const issue of [...instrument.issues, ...widgets.issues]) report(issue.severity, issue.message, issue.line);

    const meta = instrument.meta;
    if (meta?.draft) continue;
    seen.add(source.slug);

    const entry: ManifestEntry = {
      slug: source.slug,
      title: meta?.name?.trim() || titleFromSlug(source.slug),
      tags: meta?.tags ?? [],
      type: meta?.type ?? 'synth',
      csd: source.csd,
      widgets: widgets.widgets.length,
      midi: detectMidi(source.text, meta?.midi).enabled,
    };
    if (meta?.description) entry.description = meta.description;
    if (meta?.author) entry.author = meta.author;
    if (meta?.license) entry.license = meta.license;
    if (meta?.order !== undefined) entry.order = meta.order;
    if (meta?.date) entry.date = meta.date;
    if (source.preview) entry.preview = source.preview;
    entries.push(entry);
  }

  entries.sort((a, b) => {
    const ao = a.order ?? Number.POSITIVE_INFINITY;
    const bo = b.order ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  return { manifest: { version: MANIFEST_VERSION, generatedAt: now.toISOString(), instruments: entries }, problems };
}
