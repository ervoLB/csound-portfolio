/**
 * Compiles and runs every instrument with the official Csound wasm, the same way
 * the browser player does. Fails (exit code 1) when an instrument doesn't compile,
 * crashes Csound, or prints errors while running. Run before every deploy:
 *   npx vite-node scripts/check-instruments.ts
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { CsoundCore } from '../player/engine/csound-worklet.js';
import { prepareCsd } from '../player/engine/csdOptions';
import { classifyLine } from '../player/engine/csoundLog';
import { detectMidi } from '../player/engine/midiDetect';
import { inputChannelDefaults, parseInstrument, parseWidgets } from '../player/meta';
import release from '../player/engine/csoundRelease.json';
import { findInstruments, formatProblem } from './instrumentFiles';
import { buildManifest } from '../player/meta/manifest';

const SAMPLE_RATE = 48000;
const BLOCK = 128;
const SECONDS = 2;

async function loadWasm(root: string): Promise<WebAssembly.Module> {
  const path = join(root, '.cache', 'csound', release.version, 'csound.wasm');
  try {
    await stat(path);
  } catch {
    console.log(`Downloading Csound ${release.version} from ${release.wasmUrl} …`);
    const res = await fetch(release.wasmUrl);
    if (!res.ok) throw new Error(`Could not download Csound (HTTP ${res.status}) from ${release.wasmUrl}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, new Uint8Array(await res.arrayBuffer()));
  }
  return WebAssembly.compile(await readFile(path));
}

interface Result {
  slug: string;
  ok: boolean;
  messages: string[];
  peak: number;
}

async function checkOne(module: WebAssembly.Module, slug: string, text: string): Promise<Result> {
  const lines: string[] = [];
  const errors: string[] = [];
  const core = new CsoundCore({
    post: (msg) => {
      if (msg.type === 'log') lines.push(...(msg.lines as string[]));
      if (msg.type === 'error') errors.push(String(msg.message));
    },
  });
  await core.init(module);
  const meta = parseInstrument(text).meta;
  const midi = detectMidi(text, meta?.midi).enabled;
  const channels = inputChannelDefaults(parseWidgets(text).widgets);
  const prepared = prepareCsd(text, { sampleRate: SAMPLE_RATE, midi });
  let result;
  try {
    result = core.load({ csd: prepared.csd, options: prepared.options, midi, channels });
  } catch (error) {
    return { slug, ok: false, messages: [`Csound crashed while starting: ${error}`, ...lines.filter((l) => classifyLine(l) === 'error')], peak: 0 };
  }
  if (!result.ok) {
    core.flushLog(true);
    return { slug, ok: false, messages: [result.error, ...lines.filter((l) => classifyLine(l) === 'error')], peak: 0 };
  }
  if (midi) core.midi(0x90, 60, 100); // MIDI instruments are silent until a note arrives
  const l = new Float32Array(BLOCK);
  const r = new Float32Array(BLOCK);
  let peak = 0;
  const blocks = Math.ceil((SECONDS * SAMPLE_RATE) / BLOCK);
  for (let i = 0; i < blocks && (core.playing || i === 0); i++) {
    core.render(l, r);
    for (let j = 0; j < BLOCK; j++) peak = Math.max(peak, Math.abs(l[j]), Math.abs(r[j]));
    if (midi && i === Math.floor(blocks / 2)) core.midi(0x80, 60, 0);
  }
  core.flushLog(true);
  const errorLines = lines.filter((line) => classifyLine(line) === 'error');
  const messages = [...errors, ...errorLines];
  return { slug, ok: messages.length === 0 && !core.broken, messages, peak };
}

const root = resolve(process.cwd());
const found = findInstruments(root);
const { manifest, problems } = buildManifest(found.sources);
const allProblems = [...found.problems, ...problems];
for (const p of allProblems) console.warn(formatProblem(p));

const module = await loadWasm(root);
let failed = allProblems.filter((p) => p.severity === 'error' && !/Widget|meta-opcode|@INSTRUMENT/i.test(p.message)).length;
const listed = new Set(manifest.instruments.map((i) => i.slug));
for (const source of found.sources) {
  if (!listed.has(source.slug)) continue;
  const res = await checkOne(module, source.slug, source.text);
  const db = res.peak > 0 ? `${(20 * Math.log10(res.peak)).toFixed(1)} dBFS peak` : 'silent';
  if (res.ok) {
    console.log(`ok    ${source.csd} (${db})`);
  } else {
    failed++;
    console.error(`FAIL  ${source.csd}`);
    for (const m of res.messages.slice(0, 12)) console.error(`      ${m}`);
  }
}
if (manifest.instruments.length === 0) console.warn('No instruments found in instruments/.');
if (failed > 0) {
  console.error(`\n${failed} problem(s) found. Fix them before publishing.`);
  process.exit(1);
}
console.log(`\nAll ${manifest.instruments.length} instrument(s) compile and run with Csound ${release.version}.`);
