/**
 * Finds the instruments on disk:
 *   instruments/<slug>/<anything>.csd   (one CSD per folder; <slug>.csd preferred)
 *   instruments/<slug>.csd              (a single file also works)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PREVIEW_NAMES, type InstrumentSource, type ManifestProblem } from '../player/meta/manifest';

export const INSTRUMENTS_DIR = 'instruments';

export function findInstruments(root: string): { sources: InstrumentSource[]; problems: ManifestProblem[] } {
  const dir = join(root, INSTRUMENTS_DIR);
  const sources: InstrumentSource[] = [];
  const problems: ManifestProblem[] = [];
  if (!existsSync(dir)) return { sources, problems };

  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isFile() && /\.csd$/i.test(name)) {
      const slug = name.replace(/\.csd$/i, '');
      sources.push({ slug, csd: `${INSTRUMENTS_DIR}/${name}`, text: readFileSync(full, 'utf8') });
      continue;
    }
    if (!stat.isDirectory()) continue;
    const csds = readdirSync(full).filter((f) => /\.csd$/i.test(f)).sort();
    if (csds.length === 0) {
      problems.push({ slug: name, file: `${INSTRUMENTS_DIR}/${name}/`, severity: 'warning', message: 'This folder has no .csd file and is skipped.' });
      continue;
    }
    const chosen = csds.find((f) => f.toLowerCase() === `${name.toLowerCase()}.csd`) ?? csds[0];
    if (csds.length > 1) {
      problems.push({
        slug: name,
        file: `${INSTRUMENTS_DIR}/${name}/`,
        severity: 'warning',
        message: `More than one .csd in this folder; using ${chosen}. Name the main file ${name}.csd or move the others out.`,
      });
    }
    const preview = PREVIEW_NAMES.find((p) => existsSync(join(full, p)));
    sources.push({
      slug: name,
      csd: `${INSTRUMENTS_DIR}/${name}/${chosen}`,
      text: readFileSync(join(full, chosen), 'utf8'),
      ...(preview ? { preview: `${INSTRUMENTS_DIR}/${name}/${preview}` } : {}),
    });
  }
  return { sources, problems };
}

export function formatProblem(p: ManifestProblem): string {
  return `${p.severity === 'error' ? 'error' : 'warning'}: ${p.file}${p.line ? `:${p.line}` : ''} ${p.message}`;
}
