// Types for the plain-JS worklet module (used by tests and the engine).

export const PROCESSOR_NAME: string;
export const REQUIRED_EXPORTS: string[];
export const MIDI_EXPORTS: string[];

export type CoreMessage = { type: string; [key: string]: any };

export interface LoadRequest {
  csd: string;
  options?: string[];
  midi?: boolean;
  channels?: Record<string, number>;
}

export type LoadResult =
  | { ok: true; sr: number; ksmps: number; nchnls: number; zerodbfs: number }
  | { ok: false; error: string };

export function lookupVfs(files: Map<string, Uint8Array>, path: string): Uint8Array | undefined;

export class CsoundCore {
  constructor(options: { post: (msg: CoreMessage) => void });
  files: Map<string, Uint8Array>;
  playing: boolean;
  ended: boolean;
  midiEnabled: boolean;
  broken: boolean;
  instanceCount: number;
  sr: number;
  ksmps: number;
  nchnls: number;
  init(wasm: ArrayBuffer | Uint8Array | WebAssembly.Module): Promise<{ ok: true }>;
  load(request: LoadRequest): LoadResult;
  stop(): void;
  setChannel(name: string, value: number): void;
  getChannel(name: string): number;
  watch(names: string[], pollBlocks?: number): void;
  midi(status: number, data1: number, data2: number): boolean;
  setGain(value: number): void;
  setLimiter(enabled: boolean): void;
  render(outL: Float32Array, outR: Float32Array): void;
  flushLog(all: boolean): void;
  memoryBytes(): number;
  handle(msg: CoreMessage): Promise<void>;
}
