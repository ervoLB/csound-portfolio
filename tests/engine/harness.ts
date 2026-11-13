import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CsoundCore, type CoreMessage } from '../../player/engine/csound-worklet.js';
import { prepareCsd } from '../../player/engine/csdOptions';
import release from '../../player/engine/csoundRelease.json';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wasmPath = join(root, '.cache', 'csound', release.version, 'csound.wasm');

let modulePromise: Promise<WebAssembly.Module> | null = null;

/** The official Csound wasm, downloaded once into .cache/ and compiled once per test file. */
export function csoundModule(): Promise<WebAssembly.Module> {
  modulePromise ??= (async () => {
    try {
      await stat(wasmPath);
    } catch {
      const res = await fetch(release.wasmUrl);
      if (!res.ok) throw new Error(`Could not download ${release.wasmUrl}: HTTP ${res.status}`);
      await mkdir(dirname(wasmPath), { recursive: true });
      await writeFile(wasmPath, new Uint8Array(await res.arrayBuffer()));
    }
    return WebAssembly.compile(await readFile(wasmPath));
  })();
  return modulePromise;
}

export interface TestCore {
  core: CsoundCore;
  messages: CoreMessage[];
  logText(): string;
}

export async function createCore(): Promise<TestCore> {
  const messages: CoreMessage[] = [];
  const core = new CsoundCore({ post: (msg) => messages.push(msg) });
  await core.init(await csoundModule());
  return {
    core,
    messages,
    logText: () => messages.filter((m) => m.type === 'log').flatMap((m) => m.lines as string[]).join('\n'),
  };
}

export const SAMPLE_RATE = 48000;
export const QUANTUM = 128;

/** Compile a CSD the same way the browser engine does. */
export function load(core: CsoundCore, csd: string, opts: { midi?: boolean; channels?: Record<string, number>; sampleRate?: number } = {}) {
  const prepared = prepareCsd(csd, { sampleRate: opts.sampleRate ?? SAMPLE_RATE, midi: opts.midi ?? false });
  return core.load({ csd: prepared.csd, options: prepared.options, midi: opts.midi ?? false, channels: opts.channels ?? {} });
}

export interface Rendered {
  left: Float32Array;
  right: Float32Array;
  peak: number;
}

/** Render `seconds` of audio in 128-frame blocks, like an AudioWorklet would. */
export function render(core: CsoundCore, seconds: number): Rendered {
  const blocks = Math.ceil((seconds * SAMPLE_RATE) / QUANTUM);
  const left = new Float32Array(blocks * QUANTUM);
  const right = new Float32Array(blocks * QUANTUM);
  const l = new Float32Array(QUANTUM);
  const r = new Float32Array(QUANTUM);
  let peak = 0;
  for (let b = 0; b < blocks; b++) {
    core.render(l, r);
    left.set(l, b * QUANTUM);
    right.set(r, b * QUANTUM);
    for (let i = 0; i < QUANTUM; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  return { left, right, peak };
}

export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** Rising zero crossings → frequency estimate. */
export function estimateFrequency(samples: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1] <= 0 && samples[i] > 0) crossings++;
  return crossings / (samples.length / SAMPLE_RATE);
}

export function csd(orchestra: string, score = 'i 1 0 z', options = '-odac'): string {
  return `<CsoundSynthesizer>
<CsOptions>
${options}
</CsOptions>
<CsInstruments>
${orchestra}
</CsInstruments>
<CsScore>
${score}
</CsScore>
</CsoundSynthesizer>
`;
}
