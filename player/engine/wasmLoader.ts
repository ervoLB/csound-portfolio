/**
 * Fetches the Csound wasm once per page and keeps the bytes in memory.
 *
 * - `preloadWasm()` starts the download quietly at browser idle time (skipped when
 *   the visitor has data saving turned on).
 * - `loadWasm()` returns the same in-flight/finished promise to every caller, so the
 *   file is downloaded at most once per page load. A failed download can be retried.
 * - The bytes are never transferred (neutered) when posted to the worklet, so this
 *   cached copy stays valid.
 */
import release from './csoundRelease.json';

export const DEFAULT_WASM_URL: string = release.wasmUrl;
export const CSOUND_VERSION: string = release.version;
const EXPECTED_BYTES: number = release.bytes;

export type WasmStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface WasmProgress {
  status: WasmStatus;
  /** Bytes received so far. */
  loaded: number;
  /** Best estimate of the total size (may be approximate). */
  total: number;
  /** 0..1 */
  fraction: number;
  url: string;
  error?: string;
}

type Listener = (progress: WasmProgress) => void;

interface LoaderState {
  url: string | null;
  promise: Promise<ArrayBuffer> | null;
  progress: WasmProgress;
  listeners: Set<Listener>;
  preloadScheduled: boolean;
}

const state: LoaderState = {
  url: null,
  promise: null,
  progress: { status: 'idle', loaded: 0, total: EXPECTED_BYTES, fraction: 0, url: DEFAULT_WASM_URL },
  listeners: new Set(),
  preloadScheduled: false,
};

function emit(update: Partial<WasmProgress>): void {
  state.progress = { ...state.progress, ...update };
  for (const listener of state.listeners) listener(state.progress);
}

export function wasmProgress(): WasmProgress {
  return state.progress;
}

export function onWasmProgress(listener: Listener): () => void {
  state.listeners.add(listener);
  listener(state.progress);
  return () => state.listeners.delete(listener);
}

function isWasm(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false;
  const h = new Uint8Array(bytes, 0, 4);
  return h[0] === 0x00 && h[1] === 0x61 && h[2] === 0x73 && h[3] === 0x6d;
}

async function download(url: string, fetchImpl: typeof fetch): Promise<ArrayBuffer> {
  emit({ status: 'loading', loaded: 0, fraction: 0, url, error: undefined });
  const init: RequestInit & { priority?: string } = { priority: 'low', credentials: 'omit', mode: 'cors' };
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} while loading Csound from ${url}`);

  // Content-Length is the compressed size when the server gzips, while the stream yields
  // decompressed bytes, so never let it shrink the estimate below the known wasm size.
  const header = Number(response.headers.get('content-length'));
  const total = Math.max(EXPECTED_BYTES, Number.isFinite(header) ? header : 0);

  let bytes: ArrayBuffer;
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      emit({ loaded, total: Math.max(total, loaded), fraction: Math.min(0.99, loaded / Math.max(total, loaded)) });
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    bytes = out.buffer;
  } else {
    bytes = await response.arrayBuffer();
  }
  if (!isWasm(bytes)) throw new Error(`The file at ${url} is not a WebAssembly binary`);
  emit({ status: 'loaded', loaded: bytes.byteLength, total: bytes.byteLength, fraction: 1 });
  return bytes;
}

/**
 * Returns the wasm bytes, downloading them on first use. Every caller shares one
 * download. If a different URL is requested after loading started, the first URL wins.
 */
export function loadWasm(url: string = DEFAULT_WASM_URL, fetchImpl: typeof fetch = fetch): Promise<ArrayBuffer> {
  if (state.promise) return state.promise;
  state.url = url;
  const promise = download(url, fetchImpl).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    emit({ status: 'error', error: message });
    if (state.promise === promise) state.promise = null; // allow retry
    throw new Error(message);
  });
  state.promise = promise;
  return promise;
}

export interface PreloadOptions {
  /** Delay used when requestIdleCallback is unavailable (Safari). */
  fallbackDelayMs?: number;
}

/**
 * Starts the download in the background once the browser is idle. Safe to call many
 * times. Skipped when the visitor asked to save data; the wasm then loads when audio is
 * first unlocked (the first click or key press on the page, see warmUpEngine).
 */
export function preloadWasm(url: string = DEFAULT_WASM_URL, options: PreloadOptions = {}): void {
  if (state.promise || state.preloadScheduled) return;
  const connection = (globalThis.navigator as Navigator & { connection?: { saveData?: boolean } } | undefined)?.connection;
  if (connection?.saveData) return;
  state.preloadScheduled = true;
  const start = () => {
    state.preloadScheduled = false;
    loadWasm(url).catch(() => {
      /* reported through onWasmProgress; play() will retry */
    });
  };
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(start, { timeout: 4000 });
  else setTimeout(start, options.fallbackDelayMs ?? 1500);
}

/** Test helper: forget the cached download. */
export function resetWasmLoaderForTests(): void {
  state.url = null;
  state.promise = null;
  state.preloadScheduled = false;
  state.progress = { status: 'idle', loaded: 0, total: EXPECTED_BYTES, fraction: 0, url: DEFAULT_WASM_URL };
}
