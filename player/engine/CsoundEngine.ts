/**
 * Main-thread side of the Csound engine.
 *
 * One engine per page: one AudioContext, one AudioWorkletNode, one Csound wasm
 * instance. Every player on the page shares it, so only one instrument plays at a
 * time and the 8 MB wasm is downloaded and compiled exactly once.
 */
import workletUrl from './csound-worklet.js?url';
import { prepareCsd } from './csdOptions';
import { detectMidi, type MidiOverride } from './midiDetect';
import { DEFAULT_WASM_URL, loadWasm, preloadWasm } from './wasmLoader';

export const PROCESSOR_NAME = 'csound-portfolio';

export type EngineState =
  | 'idle' // nothing loaded yet
  | 'starting' // AudioContext / worklet / wasm being prepared
  | 'compiling'
  | 'playing'
  | 'stopped'
  | 'ended' // the score finished
  | 'error';

export interface PlayOptions {
  /** Explicit MIDI setting from @INSTRUMENT; otherwise auto-detected. */
  midi?: MidiOverride;
  /** Initial control-channel values (widget defaults / current values). */
  channels?: Record<string, number>;
}

export type PlayResult =
  | { ok: true; sr: number; ksmps: number; nchnls: number; zerodbfs: number; midi: boolean; removedOptions: string[] }
  | { ok: false; error: string; superseded?: boolean };

export interface EngineEvents {
  state: { state: EngineState; error?: string };
  log: { lines: string[]; suppressed: number };
  channels: { values: Record<string, number> };
  level: { peakL: number; peakR: number; clipped: boolean };
  ended: Record<string, never>;
}

type Handler<K extends keyof EngineEvents> = (detail: EngineEvents[K]) => void;

/** Minimal structural types so the engine can be tested with fakes in Node. */
export interface AudioContextLike {
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  readonly audioWorklet: { addModule(url: string): Promise<void> };
  resume(): Promise<void>;
}

export interface WorkletNodeLike {
  port: { postMessage(message: unknown): void; onmessage: ((event: { data: any }) => void) | null };
  connect(destination: unknown): unknown;
  disconnect(): void;
}

export interface EngineEnvironment {
  createContext(): AudioContextLike;
  createNode(context: AudioContextLike): WorkletNodeLike;
  loadWasm(url: string): Promise<ArrayBuffer>;
  workletUrl: string;
}

const browserEnvironment: EngineEnvironment = {
  createContext: () => new AudioContext({ latencyHint: 'interactive' }) as unknown as AudioContextLike,
  createNode: (context) =>
    new AudioWorkletNode(context as unknown as AudioContext, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    }) as unknown as WorkletNodeLike,
  loadWasm: (url) => loadWasm(url),
  workletUrl,
};

export interface EngineOptions {
  wasmUrl?: string;
  environment?: EngineEnvironment;
}

export class CsoundEngine {
  private static sharedInstance: CsoundEngine | null = null;

  /** The page-wide engine. The first caller's wasmUrl wins. */
  static shared(options: EngineOptions = {}): CsoundEngine {
    CsoundEngine.sharedInstance ??= new CsoundEngine(options);
    return CsoundEngine.sharedInstance;
  }

  /** Test helper. */
  static resetShared(): void {
    CsoundEngine.sharedInstance = null;
  }

  readonly wasmUrl: string;
  private readonly env: EngineEnvironment;
  private context: AudioContextLike | null = null;
  private node: WorkletNodeLike | null = null;
  private startPromise: Promise<void> | null = null;
  private requestCounter = 0;
  private latestPlayRequest = 0;
  private pending = new Map<number, (msg: any) => void>();
  private handlers = new Map<keyof EngineEvents, Set<(detail: any) => void>>();
  private currentState: EngineState = 'idle';
  private lastError: string | undefined;
  private volume = 1;
  private watched: string[] = [];
  private currentMidi = false;
  private playsInFlight = 0;

  constructor(options: EngineOptions = {}) {
    this.wasmUrl = options.wasmUrl ?? DEFAULT_WASM_URL;
    this.env = options.environment ?? browserEnvironment;
  }

  // --- events ------------------------------------------------------------------

  on<K extends keyof EngineEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const handlers = set;
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  private emit<K extends keyof EngineEvents>(event: K, detail: EngineEvents[K]): void {
    const set = this.handlers.get(event);
    if (set) for (const handler of [...set]) handler(detail);
  }

  get state(): EngineState {
    return this.currentState;
  }

  get error(): string | undefined {
    return this.lastError;
  }

  /**
   * True while an instrument is playing, compiling, or a play() request is in
   * flight. Merely warming up (audio unlocked, wasm loading) is not busy.
   */
  get busy(): boolean {
    return this.currentState === 'playing' || this.currentState === 'compiling' || this.playsInFlight > 0;
  }

  /** True when the current instrument accepts MIDI input. */
  get midiEnabled(): boolean {
    return this.currentMidi;
  }

  get sampleRate(): number | null {
    return this.context?.sampleRate ?? null;
  }

  private setState(state: EngineState, error?: string): void {
    this.currentState = state;
    this.lastError = error;
    this.emit('state', { state, error });
  }

  // --- startup -----------------------------------------------------------------

  /** Start downloading the wasm in the background (no audio, no user gesture needed). */
  preload(): void {
    if (this.env === browserEnvironment) preloadWasm(this.wasmUrl);
    else void this.env.loadWasm(this.wasmUrl).catch(() => {});
  }

  /**
   * Create the AudioContext and worklet. Must be called from a user gesture
   * (click / key press) the first time; later calls are cheap.
   */
  unlock(): Promise<void> {
    if (!this.context) {
      // Created synchronously inside the gesture so the browser allows audio.
      this.context = this.env.createContext();
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    if (!this.startPromise) {
      this.startPromise = this.start(this.context).catch((error: unknown) => {
        this.startPromise = null;
        if (this.node) {
          this.node.disconnect();
          this.node = null;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.setState('error', message);
        throw new Error(message);
      });
    }
    return this.startPromise;
  }

  /** Call once per page: the first pointer or key press anywhere unlocks audio. */
  installGestureUnlock(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = globalThis as unknown as EventTarget): void {
    // pointerdown/keydown are early; click/touchend count as activation on iOS Safari.
    const events = ['pointerdown', 'keydown', 'click', 'touchend'];
    let fired = false;
    const handler = () => {
      if (fired) return;
      fired = true;
      for (const name of events) target.removeEventListener(name, handler, true);
      this.unlock().catch(() => {});
    };
    for (const name of events) target.addEventListener(name, handler, true);
  }

  private async start(context: AudioContextLike): Promise<void> {
    if (this.currentState === 'idle' || this.currentState === 'error') this.setState('starting');
    const wasmPromise = this.env.loadWasm(this.wasmUrl);
    await context.audioWorklet.addModule(this.env.workletUrl);
    const node = this.env.createNode(context);
    node.port.onmessage = (event) => this.onMessage(event.data);
    node.connect(context.destination);
    this.node = node;
    const wasm = await wasmPromise;
    const initialized = this.waitFor((msg) => msg.type === 'initialized' || msg.type === 'initError');
    node.port.postMessage({ type: 'init', wasm });
    const result = await initialized;
    if (result.type === 'initError') throw new Error(result.message);
    node.port.postMessage({ type: 'gain', value: this.volume });
    if (this.watched.length > 0) node.port.postMessage({ type: 'watch', names: this.watched });
    if (this.currentState === 'starting') this.setState('idle');
  }

  // --- playback ----------------------------------------------------------------

  /**
   * Compile and play a CSD. Stops whatever is playing. If another play() starts
   * before this one finishes, this one resolves with `superseded: true`.
   */
  async play(csdText: string, options: PlayOptions = {}): Promise<PlayResult> {
    this.playsInFlight++;
    try {
      return await this.playInner(csdText, options);
    } finally {
      this.playsInFlight--;
    }
  }

  private async playInner(csdText: string, options: PlayOptions): Promise<PlayResult> {
    const request = ++this.requestCounter;
    this.latestPlayRequest = request;
    try {
      await this.unlock();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (request !== this.latestPlayRequest) return { ok: false, error: 'superseded', superseded: true };
    const context = this.context!;
    if (context.state === 'suspended') await context.resume().catch(() => {});

    const midi = detectMidi(csdText, options.midi).enabled;
    const prepared = prepareCsd(csdText, { sampleRate: context.sampleRate, midi });
    this.setState('compiling');
    const reply = this.waitFor((msg) => msg.type === 'loaded' && msg.requestId === request);
    this.post({ type: 'load', requestId: request, csd: prepared.csd, options: prepared.options, midi, channels: options.channels ?? {} });
    const result = await reply;

    if (request !== this.latestPlayRequest) return { ok: false, error: 'superseded', superseded: true };
    if (!result.ok) {
      this.currentMidi = false;
      this.setState('error', result.error);
      return { ok: false, error: result.error };
    }
    this.currentMidi = midi;
    this.setState('playing');
    return {
      ok: true,
      sr: result.sr,
      ksmps: result.ksmps,
      nchnls: result.nchnls,
      zerodbfs: result.zerodbfs,
      midi,
      removedOptions: prepared.removed,
    };
  }

  /** Stop playback (the engine stays ready). */
  async stop(): Promise<void> {
    this.latestPlayRequest = ++this.requestCounter;
    this.currentMidi = false;
    if (!this.node) {
      if (this.currentState !== 'idle') this.setState('stopped');
      return;
    }
    const request = this.latestPlayRequest;
    const done = this.waitFor((msg) => msg.type === 'stopped' && msg.requestId === request);
    this.post({ type: 'stop', requestId: request });
    await done;
    this.setState('stopped');
  }

  // --- control -----------------------------------------------------------------

  setChannel(name: string, value: number): void {
    this.post({ type: 'setChannel', name, value });
  }

  setChannels(values: Record<string, number>): void {
    this.post({ type: 'setChannels', values });
  }

  async getChannel(name: string): Promise<number> {
    if (!this.node) return 0;
    const request = ++this.requestCounter;
    const reply = this.waitFor((msg) => msg.type === 'channelValue' && msg.requestId === request);
    this.post({ type: 'getChannel', requestId: request, name });
    return (await reply).value;
  }

  /** Output channels to report back via the `channels` event (meters, live labels). */
  watch(names: string[]): void {
    this.watched = [...new Set(names)];
    this.post({ type: 'watch', names: this.watched });
  }

  /** Raw MIDI message; ignored unless the current instrument has MIDI enabled. */
  midi(status: number, data1: number, data2: number): void {
    if (!this.currentMidi) return;
    this.post({ type: 'midi', data: [status, data1, data2] });
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(2, value));
    this.post({ type: 'gain', value: this.volume });
  }

  get currentVolume(): number {
    return this.volume;
  }

  setLimiter(enabled: boolean): void {
    this.post({ type: 'limiter', enabled });
  }

  // --- messaging ---------------------------------------------------------------

  private post(message: Record<string, unknown>): void {
    this.node?.port.postMessage(message);
  }

  private waitFor(match: (msg: any) => boolean): Promise<any> {
    const id = ++this.requestCounter * -1; // negative keys never clash with request ids
    return new Promise((resolve) => {
      this.pending.set(id, (msg) => {
        if (match(msg)) {
          this.pending.delete(id);
          resolve(msg);
        }
      });
    });
  }

  private onMessage(msg: any): void {
    if (!msg || typeof msg.type !== 'string') return;
    for (const check of [...this.pending.values()]) check(msg);
    switch (msg.type) {
      case 'log':
        this.emit('log', { lines: msg.lines ?? [], suppressed: msg.suppressed ?? 0 });
        break;
      case 'channels':
        this.emit('channels', { values: msg.values ?? {} });
        break;
      case 'level':
        this.emit('level', { peakL: msg.peakL, peakR: msg.peakR, clipped: Boolean(msg.clipped) });
        break;
      case 'ended':
        if (this.currentState === 'playing') {
          this.currentMidi = false;
          this.setState('ended');
          this.emit('ended', {});
        }
        break;
      case 'error':
        this.currentMidi = false;
        this.setState('error', msg.message);
        break;
      default:
        break;
    }
  }
}
