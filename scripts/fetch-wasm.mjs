// Downloads the pinned official Csound wasm into .cache/ for tests and local tools.
// The wasm is never committed to the repository.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = JSON.parse(await readFile(join(root, 'player/engine/csoundRelease.json'), 'utf8'));

export const cachedWasmPath = join(root, '.cache', 'csound', release.version, 'csound.wasm');

function isWasm(bytes) {
  return bytes.length > 4 && bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
}

export async function ensureCsoundWasm({ quiet = false } = {}) {
  try {
    const s = await stat(cachedWasmPath);
    if (s.size > 1_000_000) return cachedWasmPath;
  } catch { /* not cached yet */ }
  if (!quiet) console.log(`Downloading Csound ${release.version} wasm from ${release.wasmUrl} …`);
  const res = await fetch(release.wasmUrl);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${release.wasmUrl}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!isWasm(bytes)) throw new Error('Downloaded file is not a WebAssembly binary');
  await mkdir(dirname(cachedWasmPath), { recursive: true });
  await writeFile(cachedWasmPath, bytes);
  if (!quiet) console.log(`Saved ${bytes.length} bytes to ${cachedWasmPath}`);
  return cachedWasmPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await ensureCsoundWasm();
}
