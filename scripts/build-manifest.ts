/**
 * Writes instruments.json for the current instruments/ folder (also done
 * automatically by `npm run dev` and `npm run build`).
 *   npx vite-node scripts/build-manifest.ts [--out path]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildManifest } from '../player/meta/manifest';
import { findInstruments, formatProblem } from './instrumentFiles';

const root = resolve(process.cwd());
const outIndex = process.argv.indexOf('--out');
const out = resolve(root, outIndex > 0 ? process.argv[outIndex + 1] : 'instruments.json');

const found = findInstruments(root);
const { manifest, problems } = buildManifest(found.sources);
for (const p of [...found.problems, ...problems]) console.warn(formatProblem(p));
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${manifest.instruments.length} instrument(s) to ${out}`);
