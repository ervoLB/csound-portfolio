/**
 * Csound AudioWorklet processor for the personal csound portfolio.
 *
 * Runs the official Csound 7 WebAssembly build (`@csound/wasm-bin`, `lib/csound.wasm`)
 * directly on the audio thread.
 *
 * Layout:
 *   - `CsoundCore`: all engine logic, free of AudioWorklet APIs, so it also runs in Node
 *     (see tests/engine). One wasm instance lives for the whole page; each instrument
 *     gets a fresh Csound object inside that instance.
 *   - `CsoundPortfolioProcessor`: thin AudioWorkletProcessor wrapper (message routing +
 *     process()). Only registered when running inside an AudioWorkletGlobalScope.
 *
 * This file must stay self-contained plain JavaScript: it is loaded with
 * `audioWorklet.addModule()` and cannot import anything.
 */

// ---------------------------------------------------------------------------
// AudioWorkletGlobalScope polyfills (TextEncoder/TextDecoder are missing there)
// ---------------------------------------------------------------------------
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    encode(str) {
      const out = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
          const d = str.charCodeAt(i + 1);
          if (d >= 0xdc00 && d <= 0xdfff) {
            c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
            i++;
          }
        }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
      return new Uint8Array(out);
    }
  };
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    decode(buf) {
      if (!buf || buf.length === 0) return '';
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let str = '';
      for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        if (b < 0x80) { str += String.fromCharCode(b); i += 1; }
        else if ((b & 0xe0) === 0xc0) { str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
        else if ((b & 0xf0) === 0xe0) {
          str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
          i += 3;
        } else if ((b & 0xf8) === 0xf0) {
          const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
          str += String.fromCodePoint(cp);
          i += 4;
        } else { str += '�'; i += 1; }
      }
      return str;
    }
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const PROCESSOR_NAME = 'csound-portfolio';

/** Exports the engine cannot work without. Checked once after instantiation. */
export const REQUIRED_EXPORTS = [
  '_initialize',
  'malloc',
  'free',
  'csoundCreateWasi',
  'csoundCompileCSD',
  'csoundStartWasi',
  'csoundPerformKsmps',
  'csoundDestroy',
  'csoundGetSpout',
  'csoundGetKsmps',
  'csoundGetSr',
  'csoundGetChannels',
  'csoundGet0dBFS',
  'csoundSetControlChannel',
  'csoundGetControlChannelWasi',
  'csoundSetHostAudioIO',
  'csoundSetOption',
];

/** Exports only needed for MIDI-enabled instruments. */
export const MIDI_EXPORTS = ['pushMidiMessage', 'csoundSetHostMIDIIO', 'csoundSetMidiCallbacks'];

/** csoundCompileCSD mode: the second argument is CSD text, not a file name. */
const COMPILE_CSD_TEXT = 1;

/** Initial / maximum wasm memory in 64 KiB pages (module requires >= 47, no maximum). */
const MEMORY_INITIAL_PAGES = 256; // 16 MiB
const MEMORY_MAXIMUM_PAGES = 16384; // 1 GiB

/** Csound messages are flushed to the main thread every this many render calls (~50 ms). */
const LOG_FLUSH_BLOCKS = 18;
/** At most this many message lines per flush; the rest are counted as suppressed. */
const LOG_MAX_LINES_PER_FLUSH = 10;
/** Lines kept between flushes; more are only counted (no string work on the audio thread). */
const LOG_PENDING_LIMIT = 200;
/** Output-channel polling interval in render calls (~94 Hz at 48 kHz / 128). */
const DEFAULT_POLL_BLOCKS = 4;
/** Output level report interval in render calls (~30 Hz). */
const LEVEL_REPORT_BLOCKS = 12;

/** Peak limiter: threshold (linear) and release coefficient per sample. */
const LIMITER_THRESHOLD = 0.98;
const LIMITER_RELEASE = 0.9995;

// ---------------------------------------------------------------------------
// WASI imports
// ---------------------------------------------------------------------------
const ERRNO = { SUCCESS: 0, BADF: 8, INVAL: 28, NOENT: 44, NOSYS: 52, NOTSUP: 58 };

/**
 * Look up a virtual file. wasi-libc strips the leading "/" before path_open,
 * while users write absolute paths, so try both forms.
 */
export function lookupVfs(files, path) {
  if (files.has(path)) return files.get(path);
  const stripped = path.replace(/^(\.\/|\/)+/, '');
  if (files.has(stripped)) return files.get(stripped);
  if (files.has('/' + stripped)) return files.get('/' + stripped);
  return undefined;
}

/**
 * Minimal WASI preview1 implementation: stdout/stderr go to `onText`, files come
 * from an in-memory map (used by a later milestone for samples; empty in v1).
 */
function createWasiImports(memory, onText, files, isSaturated = () => false) {
  const decoder = new TextDecoder();
  const view = () => new DataView(memory.buffer);
  const readPath = (ptr, len) => decoder.decode(new Uint8Array(memory.buffer, ptr, len));
  let nextFd = 100;
  const open = new Map();

  const writeFilestat = (bufPtr, size, ino) => {
    const dv = view();
    dv.setBigUint64(bufPtr, 0n, true); // dev
    dv.setBigUint64(bufPtr + 8, BigInt(ino), true); // ino
    dv.setUint8(bufPtr + 16, 4); // regular file
    dv.setBigUint64(bufPtr + 24, 1n, true); // nlink
    dv.setBigUint64(bufPtr + 32, BigInt(size), true); // size
    dv.setBigUint64(bufPtr + 40, 0n, true);
    dv.setBigUint64(bufPtr + 48, 0n, true);
    dv.setBigUint64(bufPtr + 56, 0n, true);
  };

  const imports = {
    args_sizes_get: (argc, argvBufSize) => {
      const dv = view();
      dv.setUint32(argc, 0, true);
      dv.setUint32(argvBufSize, 0, true);
      return ERRNO.SUCCESS;
    },
    args_get: () => ERRNO.SUCCESS,
    environ_sizes_get: (count, size) => {
      const dv = view();
      dv.setUint32(count, 0, true);
      dv.setUint32(size, 0, true);
      return ERRNO.SUCCESS;
    },
    environ_get: () => ERRNO.SUCCESS,
    clock_time_get: (_id, _precision, out) => {
      view().setBigUint64(out, BigInt(Date.now()) * 1000000n, true);
      return ERRNO.SUCCESS;
    },
    clock_res_get: (_id, out) => {
      view().setBigUint64(out, 1000n, true);
      return ERRNO.SUCCESS;
    },
    fd_write: (fd, iovs, iovsLen, nwritten) => {
      const dv = view();
      let total = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true);
        const len = dv.getUint32(iovs + i * 8 + 4, true);
        if (len > 0 && (fd === 1 || fd === 2)) {
          if (isSaturated()) onText('');
          else onText(decoder.decode(new Uint8Array(memory.buffer, ptr, len)));
        }
        total += len;
      }
      dv.setUint32(nwritten, total, true);
      return ERRNO.SUCCESS;
    },
    fd_read: (fd, iovs, iovsLen, nread) => {
      const file = open.get(fd);
      if (!file) return ERRNO.BADF;
      const dv = view();
      let total = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true);
        const len = dv.getUint32(iovs + i * 8 + 4, true);
        const n = Math.min(len, file.data.length - file.offset);
        if (n > 0) {
          new Uint8Array(memory.buffer, ptr, n).set(file.data.subarray(file.offset, file.offset + n));
          file.offset += n;
          total += n;
        }
      }
      dv.setUint32(nread, total, true);
      return ERRNO.SUCCESS;
    },
    fd_seek: (fd, offset, whence, newOffset) => {
      const file = open.get(fd);
      if (!file) return ERRNO.BADF;
      let pos = file.offset;
      if (whence === 0) pos = Number(offset);
      else if (whence === 1) pos += Number(offset);
      else if (whence === 2) pos = file.data.length + Number(offset);
      file.offset = Math.max(0, Math.min(file.data.length, pos));
      view().setBigUint64(newOffset, BigInt(file.offset), true);
      return ERRNO.SUCCESS;
    },
    fd_tell: (fd, out) => {
      const file = open.get(fd);
      if (!file) return ERRNO.BADF;
      view().setBigUint64(out, BigInt(file.offset), true);
      return ERRNO.SUCCESS;
    },
    fd_close: (fd) => {
      open.delete(fd);
      return ERRNO.SUCCESS;
    },
    fd_fdstat_get: (fd, statPtr) => {
      const dv = view();
      dv.setUint8(statPtr, fd <= 2 ? 2 : 4); // character device for stdio, regular file otherwise
      dv.setUint16(statPtr + 2, 0, true);
      dv.setBigUint64(statPtr + 8, 0xffffffffffffffffn, true);
      dv.setBigUint64(statPtr + 16, 0xffffffffffffffffn, true);
      return ERRNO.SUCCESS;
    },
    fd_filestat_get: (fd, bufPtr) => {
      const file = open.get(fd);
      if (!file) return ERRNO.BADF;
      writeFilestat(bufPtr, file.data.length, fd);
      return ERRNO.SUCCESS;
    },
    fd_fdstat_set_flags: () => ERRNO.SUCCESS,
    fd_fdstat_set_rights: () => ERRNO.SUCCESS,
    fd_filestat_set_size: () => ERRNO.NOTSUP,
    fd_filestat_set_times: () => ERRNO.NOTSUP,
    fd_pread: () => ERRNO.NOTSUP,
    fd_pwrite: () => ERRNO.NOTSUP,
    fd_sync: () => ERRNO.SUCCESS,
    fd_datasync: () => ERRNO.SUCCESS,
    fd_advise: () => ERRNO.SUCCESS,
    fd_allocate: () => ERRNO.NOTSUP,
    fd_renumber: () => ERRNO.NOTSUP,
    // fd 3 is a preopened root directory so absolute paths can resolve.
    fd_prestat_get: (fd, ptr) => {
      if (fd !== 3) return ERRNO.BADF;
      const dv = view();
      dv.setUint8(ptr, 0);
      dv.setUint32(ptr + 4, 1, true);
      return ERRNO.SUCCESS;
    },
    fd_prestat_dir_name: (fd, ptr, len) => {
      if (fd !== 3 || len < 1) return ERRNO.BADF;
      new Uint8Array(memory.buffer)[ptr] = 46; // "."
      return ERRNO.SUCCESS;
    },
    fd_readdir: () => ERRNO.NOTSUP,
    path_open: (_dirfd, _dirflags, pathPtr, pathLen, _oflags, _rb, _ri, _fdflags, fdOut) => {
      const data = lookupVfs(files, readPath(pathPtr, pathLen));
      if (!data) return ERRNO.NOENT;
      const fd = nextFd++;
      open.set(fd, { data, offset: 0 });
      view().setUint32(fdOut, fd, true);
      return ERRNO.SUCCESS;
    },
    path_filestat_get: (_dirfd, _flags, pathPtr, pathLen, bufPtr) => {
      const data = lookupVfs(files, readPath(pathPtr, pathLen));
      if (!data) return ERRNO.NOENT;
      writeFilestat(bufPtr, data.length, 1);
      return ERRNO.SUCCESS;
    },
    path_filestat_set_times: () => ERRNO.NOTSUP,
    path_create_directory: () => ERRNO.NOTSUP,
    path_remove_directory: () => ERRNO.NOTSUP,
    path_unlink_file: () => ERRNO.NOTSUP,
    path_rename: () => ERRNO.NOTSUP,
    path_link: () => ERRNO.NOTSUP,
    path_symlink: () => ERRNO.NOTSUP,
    path_readlink: () => ERRNO.NOTSUP,
    poll_oneoff: () => ERRNO.NOTSUP,
    proc_exit: (code) => {
      throw new Error(`Csound called exit(${code})`);
    },
    proc_raise: () => ERRNO.NOTSUP,
    sched_yield: () => ERRNO.SUCCESS,
    random_get: (ptr, len) => {
      const bytes = new Uint8Array(memory.buffer, ptr, len);
      for (let i = 0; i < len; i++) bytes[i] = (Math.random() * 256) | 0;
      return ERRNO.SUCCESS;
    },
    sock_accept: () => ERRNO.NOSYS,
    sock_recv: () => ERRNO.NOSYS,
    sock_send: () => ERRNO.NOSYS,
    sock_shutdown: () => ERRNO.NOSYS,
  };
  return imports;
}

// ---------------------------------------------------------------------------
// Output FIFO: adapts Csound's ksmps blocks to the host's render quantum
// ---------------------------------------------------------------------------
export function createStereoFifo(capacity) {
  const cap = Math.max(1, capacity | 0);
  return { left: new Float32Array(cap), right: new Float32Array(cap), read: 0, write: 0, count: 0, capacity: cap };
}

function fifoPushSpout(fifo, spout, ksmps, nchnls, scale) {
  const space = fifo.capacity - fifo.count;
  const n = ksmps < space ? ksmps : space;
  for (let i = 0; i < n; i++) {
    const l = spout[i * nchnls] * scale;
    const r = nchnls >= 2 ? spout[i * nchnls + 1] * scale : l;
    fifo.left[fifo.write] = l;
    fifo.right[fifo.write] = r;
    fifo.write++;
    if (fifo.write === fifo.capacity) fifo.write = 0;
  }
  fifo.count += n;
}

function fifoPop(fifo, outL, outR, count) {
  const n = count < fifo.count ? count : fifo.count;
  for (let i = 0; i < n; i++) {
    outL[i] = fifo.left[fifo.read];
    outR[i] = fifo.right[fifo.read];
    fifo.read++;
    if (fifo.read === fifo.capacity) fifo.read = 0;
  }
  fifo.count -= n;
  return n;
}

// ---------------------------------------------------------------------------
// CsoundCore
// ---------------------------------------------------------------------------

/**
 * @typedef {{ type: string, [key: string]: unknown }} CoreMessage
 */

export class CsoundCore {
  /**
   * @param {{ post: (msg: CoreMessage) => void }} options
   */
  constructor({ post }) {
    this.post = post;
    this.module = null;
    this.instance = null;
    this.exports = null;
    this.memory = null;
    this.files = new Map();
    this.broken = false;
    this.instanceCount = 0;

    this.csound = 0;
    this.playing = false;
    this.ended = false;
    this.loadId = 0;
    this.midiEnabled = false;

    this.ksmps = 0;
    this.sr = 0;
    this.nchnls = 2;
    this.scale = 1;
    this.fifo = null;
    this.spoutView = null;
    this.spoutBuffer = null;
    this.spoutPtr = 0;

    this.stringPtrs = new Map(); // channel name -> malloc'd C string (lives for the page)
    this.paramQueue = new Map(); // channel -> value, applied at the start of the next block
    this.watched = [];
    this.pollBlocks = DEFAULT_POLL_BLOCKS;
    this.pollCounter = 0;

    this.gain = 1;
    this.targetGain = 1;
    this.limiterEnv = 0;
    this.limiterEnabled = true;
    this.levelCounter = 0;
    this.peakL = 0;
    this.peakR = 0;
    this.clipped = false;

    this.textBuffer = '';
    this.logLines = [];
    this.logSuppressed = 0;
    this.logCounter = 0;
  }

  // --- lifecycle -------------------------------------------------------------

  /**
   * Compile (if needed) and instantiate the Csound wasm. Called once per page.
   * @param {ArrayBuffer | Uint8Array | WebAssembly.Module} wasm
   */
  async init(wasm) {
    if (this.instance) return { ok: true };
    const module = wasm instanceof WebAssembly.Module ? wasm : await WebAssembly.compile(wasm);
    const missing = REQUIRED_EXPORTS.filter(
      (name) => !WebAssembly.Module.exports(module).some((e) => e.name === name && e.kind === 'function'),
    );
    if (missing.length > 0) {
      throw new Error(`This Csound build is missing required functions: ${missing.join(', ')}`);
    }
    this.module = module;
    this.instantiate();
    return { ok: true };
  }

  /**
   * Create a fresh wasm instance (new memory) from the compiled module. Used at
   * startup and to recover after Csound traps (e.g. a fatal error or `exitnow`),
   * which leave the old instance unusable. Synchronous: allowed on the audio
   * thread and in Node, and needs no network.
   */
  instantiate() {
    const memory = new WebAssembly.Memory({ initial: MEMORY_INITIAL_PAGES, maximum: MEMORY_MAXIMUM_PAGES });
    const decoder = new TextDecoder();
    const onText = (text) => this.appendText(text);
    const env = {
      memory,
      csoundWasiJsMessageCallback: (_csound, _attr, len, ptr) => {
        onText(this.logSaturated() ? '' : decoder.decode(new Uint8Array(memory.buffer, ptr, len)));
      },
      csoundWasiJsSystem: () => -1, // the `system` opcode is not available in the browser
      csoundWasiJsReadlineCallback: () => 0,
      csoundWasiJsDebugCallback: () => {},
      printDebugCallback: (ptr, len) => {
        onText(decoder.decode(new Uint8Array(memory.buffer, ptr, len)));
      },
      csoundLoadModules: () => 0,
      csoundLoadExternals: () => 0,
    };
    const instance = new WebAssembly.Instance(this.module, {
      wasi_snapshot_preview1: createWasiImports(memory, onText, this.files, () => this.logSaturated()),
      env,
    });
    this.memory = memory;
    this.instance = instance;
    this.exports = instance.exports;
    this.csound = 0;
    this.broken = false;
    this.stringPtrs = new Map(); // pointers belonged to the old memory
    this.spoutView = null;
    this.exports._initialize();
    this.instanceCount = (this.instanceCount || 0) + 1;
    this.flushLog(true);
  }

  /** Called when Csound trapped: the instance can't be trusted any more. */
  markBroken(error) {
    const message = error && error.message ? error.message : String(error);
    this.broken = true;
    this.playing = false;
    this.csound = 0; // never call into the broken instance again
    this.paramQueue.clear();
    this.appendText(`error: Csound stopped: ${message}\n`);
    this.flushLog(true);
    return message;
  }

  /**
   * Compile and start a CSD. Any running instrument is stopped first.
   * `options` are set through the API before compiling (see csdOptions.ts, which
   * also blanks the CSD's own <CsOptions>).
   *
   * @param {{ csd: string, options?: string[], midi?: boolean, channels?: Record<string, number> }} request
   * @returns {{ ok: true, sr: number, ksmps: number, nchnls: number, zerodbfs: number } | { ok: false, error: string }}
   */
  load({ csd, options = [], midi = false, channels = {} }) {
    if (!this.module) return { ok: false, error: 'Csound is not initialised yet' };
    if (this.broken) this.instantiate();
    this.stop();
    this.loadId++;
    const ex = this.exports;
    const cs = ex.csoundCreateWasi();
    if (!cs) return { ok: false, error: 'Could not create a Csound instance' };
    this.csound = cs;

    for (const option of options) {
      if (typeof option !== 'string' || option.length === 0) continue;
      const ptr = this.allocString(option);
      try {
        ex.csoundSetOption(cs, ptr);
      } finally {
        ex.free(ptr);
      }
    }

    this.midiEnabled = false;
    if (midi) {
      const missingMidi = MIDI_EXPORTS.filter((name) => typeof ex[name] !== 'function');
      if (missingMidi.length === 0) {
        ex.csoundSetHostMIDIIO(cs);
        ex.csoundSetMidiCallbacks(cs);
        this.midiEnabled = true;
      } else {
        this.appendText(`warning: MIDI input unavailable (missing ${missingMidi.join(', ')})\n`);
      }
    }

    const csdPtr = this.allocString(csd);
    let compileResult;
    try {
      compileResult = ex.csoundCompileCSD(cs, csdPtr, COMPILE_CSD_TEXT, 0);
    } finally {
      ex.free(csdPtr);
    }
    if (compileResult !== 0) {
      this.destroyCsound();
      this.flushLog(true);
      return { ok: false, error: `Csound could not compile this instrument (code ${compileResult})` };
    }

    ex.csoundSetHostAudioIO(cs);
    const startResult = ex.csoundStartWasi(cs);
    if (startResult !== 0) {
      this.destroyCsound();
      this.flushLog(true);
      return { ok: false, error: `Csound could not start (code ${startResult})` };
    }

    this.ksmps = ex.csoundGetKsmps(cs);
    this.sr = ex.csoundGetSr(cs);
    this.nchnls = Math.max(1, ex.csoundGetChannels(cs, 0));
    const zerodbfs = ex.csoundGet0dBFS(cs);
    this.scale = zerodbfs > 0 ? 1 / zerodbfs : 1;
    this.fifo = createStereoFifo(Math.max(this.ksmps * 2, 2048));
    this.spoutView = null;
    this.limiterEnv = 0;
    this.pollCounter = 0;

    this.paramQueue.clear();
    for (const name of Object.keys(channels)) {
      this.writeChannel(name, channels[name]);
    }
    // Allocate channel-name strings now, not later on the audio thread.
    for (const name of this.watched) this.stringPtr(name);

    this.playing = true;
    this.ended = false;
    this.flushLog(true);
    return { ok: true, sr: this.sr, ksmps: this.ksmps, nchnls: this.nchnls, zerodbfs };
  }

  /** Stop and free the current Csound object (the wasm instance stays). */
  stop() {
    this.playing = false;
    this.destroyCsound();
    this.paramQueue.clear();
    if (this.fifo) {
      this.fifo.count = 0;
      this.fifo.read = 0;
      this.fifo.write = 0;
    }
  }

  destroyCsound() {
    if (this.csound && this.exports) {
      try {
        this.exports.csoundDestroy(this.csound);
      } catch (error) {
        this.appendText(`warning: csoundDestroy failed: ${error && error.message ? error.message : error}\n`);
      }
    }
    this.csound = 0;
    this.spoutView = null;
  }

  // --- control ---------------------------------------------------------------

  /** Queue a control-channel value; applied at the start of the next block. */
  setChannel(name, value) {
    if (typeof name !== 'string' || !Number.isFinite(value)) return;
    this.paramQueue.set(name, value);
  }

  writeChannel(name, value) {
    if (!this.csound || !Number.isFinite(value)) return;
    this.exports.csoundSetControlChannel(this.csound, this.stringPtr(name), value);
  }

  getChannel(name) {
    if (!this.csound || !this.exports) return 0;
    return this.exports.csoundGetControlChannelWasi(this.csound, this.stringPtr(name));
  }

  /** Channels whose values are reported back periodically (meters, live labels). */
  watch(names, pollBlocks) {
    this.watched = Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
    // Allocate name strings here (message handler), not inside process(); before init, load() does it.
    if (this.exports) for (const name of this.watched) this.stringPtr(name);
    if (Number.isFinite(pollBlocks) && pollBlocks >= 1) this.pollBlocks = Math.floor(pollBlocks);
    this.pollCounter = 0;
  }

  /** Raw MIDI bytes; ignored unless the current instrument has MIDI enabled. */
  midi(status, data1, data2) {
    if (!this.csound || !this.midiEnabled) return false;
    this.exports.pushMidiMessage(this.csound, status & 0xff, data1 & 0x7f, data2 & 0x7f);
    return true;
  }

  setGain(value) {
    if (Number.isFinite(value)) this.targetGain = Math.max(0, Math.min(2, value));
  }

  setLimiter(enabled) {
    this.limiterEnabled = Boolean(enabled);
  }

  // --- audio -----------------------------------------------------------------

  /**
   * Fill one host block. Writes silence when nothing is playing.
   * @param {Float32Array} outL
   * @param {Float32Array} outR
   */
  render(outL, outR) {
    const frames = outL.length;
    if (!this.playing || !this.csound) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      this.tick();
      return;
    }

    if (this.paramQueue.size > 0) {
      for (const [name, value] of this.paramQueue) this.writeChannel(name, value);
      this.paramQueue.clear();
    }

    const ex = this.exports;
    let produced = 0;
    try {
      while (this.fifo.count < frames) {
        const result = ex.csoundPerformKsmps(this.csound);
        if (result !== 0) {
          this.finish();
          break;
        }
        fifoPushSpout(this.fifo, this.spout(), this.ksmps, this.nchnls, this.scale);
      }
      produced = fifoPop(this.fifo, outL, outR, frames);
    } catch (error) {
      const message = this.markBroken(error);
      this.post({ type: 'error', message: `Csound stopped unexpectedly: ${message}` });
    }
    if (produced < frames) {
      outL.fill(0, produced);
      if (outR !== outL) outR.fill(0, produced);
    }

    this.applyOutputStage(outL, outR, frames);
    this.pollWatched();
    this.tick();
  }

  /** Spout view, re-acquired when Csound grows its memory (which detaches the old buffer). */
  spout() {
    const buffer = this.memory.buffer;
    const ptr = this.exports.csoundGetSpout(this.csound);
    if (this.spoutView === null || this.spoutBuffer !== buffer || this.spoutPtr !== ptr) {
      this.spoutView = new Float64Array(buffer, ptr, this.ksmps * this.nchnls);
      this.spoutBuffer = buffer;
      this.spoutPtr = ptr;
    }
    return this.spoutView;
  }

  applyOutputStage(outL, outR, frames) {
    const target = this.targetGain;
    let gain = this.gain;
    const step = (target - gain) / frames;
    let env = this.limiterEnv;
    let peakL = this.peakL;
    let peakR = this.peakR;
    let clipped = this.clipped;
    const stereo = outR !== outL;
    for (let i = 0; i < frames; i++) {
      gain += step;
      let l = outL[i] * gain;
      let r = stereo ? outR[i] * gain : l;
      // NaN / ±Infinity guard (x - x is 0 only for finite numbers). An unstable
      // instrument can overflow to Infinity, and Infinity * 0 would become NaN later.
      if (l - l !== 0) { l = 0; clipped = true; }
      if (r - r !== 0) { r = 0; clipped = true; }
      if (this.limiterEnabled) {
        const peak = Math.max(Math.abs(l), Math.abs(r));
        env = peak > env ? peak : env * LIMITER_RELEASE;
        if (env > LIMITER_THRESHOLD) {
          const g = LIMITER_THRESHOLD / env;
          l *= g;
          r *= g;
          clipped = true;
        }
      }
      if (l > 1) { l = 1; clipped = true; } else if (l < -1) { l = -1; clipped = true; }
      if (r > 1) { r = 1; clipped = true; } else if (r < -1) { r = -1; clipped = true; }
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      if (al > peakL) peakL = al;
      if (ar > peakR) peakR = ar;
      outL[i] = l;
      if (stereo) outR[i] = r;
    }
    this.gain = target;
    this.limiterEnv = env;
    this.peakL = peakL;
    this.peakR = peakR;
    this.clipped = clipped;
  }

  pollWatched() {
    if (this.watched.length === 0) return;
    this.pollCounter++;
    if (this.pollCounter < this.pollBlocks) return;
    this.pollCounter = 0;
    const values = {};
    for (const name of this.watched) values[name] = this.getChannel(name);
    this.post({ type: 'channels', values });
  }

  finish() {
    this.playing = false;
    this.ended = true;
    this.flushLog(true);
    this.post({ type: 'ended', loadId: this.loadId });
  }

  /** Housekeeping after every render call: level reports and log flushing. */
  tick() {
    this.levelCounter++;
    if (this.levelCounter >= LEVEL_REPORT_BLOCKS) {
      this.levelCounter = 0;
      if (this.playing || this.peakL > 0 || this.peakR > 0) {
        this.post({ type: 'level', peakL: this.peakL, peakR: this.peakR, clipped: this.clipped });
      }
      this.peakL = 0;
      this.peakR = 0;
      this.clipped = false;
    }
    this.logCounter++;
    if (this.logCounter >= LOG_FLUSH_BLOCKS) {
      this.logCounter = 0;
      this.flushLog(false);
    }
  }

  // --- messages --------------------------------------------------------------

  /** True when enough messages are waiting: further text is counted, not stored. */
  logSaturated() {
    return this.logLines.length >= LOG_PENDING_LIMIT;
  }

  appendText(text) {
    if (this.logSaturated()) {
      this.logSuppressed++;
      return;
    }
    this.textBuffer += text;
    let newline = this.textBuffer.indexOf('\n');
    while (newline !== -1) {
      this.logLines.push(this.textBuffer.slice(0, newline));
      this.textBuffer = this.textBuffer.slice(newline + 1);
      newline = this.textBuffer.indexOf('\n');
    }
    // Bound memory if a CSD prints without ever ending a line.
    if (this.textBuffer.length > 4096) {
      this.logLines.push(this.textBuffer);
      this.textBuffer = '';
    }
    if (this.logLines.length > 2000) {
      const drop = this.logLines.length - 2000;
      this.logLines.splice(0, drop);
      this.logSuppressed += drop;
    }
  }

  /**
   * Send collected Csound messages to the main thread.
   * @param {boolean} all  true = send everything (compile results), false = rate-limited
   */
  flushLog(all) {
    if (all && this.textBuffer.length > 0) {
      this.logLines.push(this.textBuffer);
      this.textBuffer = '';
    }
    if (this.logLines.length === 0 && this.logSuppressed === 0) return;
    let lines = this.logLines;
    let suppressed = this.logSuppressed;
    if (!all && lines.length > LOG_MAX_LINES_PER_FLUSH) {
      suppressed += lines.length - LOG_MAX_LINES_PER_FLUSH;
      lines = lines.slice(lines.length - LOG_MAX_LINES_PER_FLUSH);
    }
    this.logLines = [];
    this.logSuppressed = 0;
    this.post({ type: 'log', lines, suppressed });
  }

  // --- memory helpers --------------------------------------------------------

  allocString(str) {
    const bytes = new TextEncoder().encode(str);
    const ptr = this.exports.malloc(bytes.length + 1);
    if (!ptr) throw new Error('Out of memory');
    const mem = new Uint8Array(this.memory.buffer, ptr, bytes.length + 1);
    mem.set(bytes);
    mem[bytes.length] = 0;
    return ptr;
  }

  stringPtr(name) {
    let ptr = this.stringPtrs.get(name);
    if (ptr === undefined) {
      ptr = this.allocString(name);
      this.stringPtrs.set(name, ptr);
    }
    return ptr;
  }

  /** Bytes currently reserved by the wasm memory (for leak tests). */
  memoryBytes() {
    return this.memory ? this.memory.buffer.byteLength : 0;
  }

  // --- message dispatch (shared by the worklet wrapper and tests) ------------

  /**
   * Handle one message from the main thread.
   * @param {{ type: string, [key: string]: any }} msg
   */
  async handle(msg) {
    try {
      await this.dispatch(msg);
    } catch (error) {
      this.post({
        type: 'log',
        lines: [`error: engine message "${msg && msg.type}" failed: ${error && error.message ? error.message : error}`],
        suppressed: 0,
      });
    }
  }

  async dispatch(msg) {
    switch (msg.type) {
      case 'init':
        try {
          await this.init(msg.wasm);
          this.post({ type: 'initialized' });
        } catch (error) {
          this.post({ type: 'initError', message: error && error.message ? error.message : String(error) });
        }
        return;
      case 'load': {
        let result;
        try {
          result = this.load(msg);
        } catch (error) {
          result = { ok: false, error: this.markBroken(error) };
        }
        this.post({ type: 'loaded', requestId: msg.requestId, loadId: this.loadId, ...result });
        return;
      }
      case 'stop':
        this.stop();
        this.post({ type: 'stopped', requestId: msg.requestId });
        return;
      case 'setChannel':
        this.setChannel(msg.name, msg.value);
        return;
      case 'setChannels':
        if (msg.values && typeof msg.values === 'object') {
          for (const name of Object.keys(msg.values)) this.setChannel(name, msg.values[name]);
        }
        return;
      case 'getChannel':
        this.post({ type: 'channelValue', requestId: msg.requestId, name: msg.name, value: this.getChannel(msg.name) });
        return;
      case 'watch':
        this.watch(msg.names, msg.pollBlocks);
        return;
      case 'midi':
        if (Array.isArray(msg.data) && msg.data.length >= 3) this.midi(msg.data[0], msg.data[1], msg.data[2]);
        return;
      case 'gain':
        this.setGain(msg.value);
        return;
      case 'limiter':
        this.setLimiter(msg.enabled);
        return;
      default:
        this.post({ type: 'log', lines: [`warning: unknown engine message "${msg.type}"`], suppressed: 0 });
    }
  }
}

// ---------------------------------------------------------------------------
// AudioWorklet wrapper
// ---------------------------------------------------------------------------
if (typeof AudioWorkletProcessor !== 'undefined' && typeof registerProcessor === 'function') {
  class CsoundPortfolioProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.core = new CsoundCore({ post: (msg) => this.port.postMessage(msg) });
      // Messages are handled strictly in order (init must finish before load).
      this.queue = Promise.resolve();
      this.port.onmessage = (event) => {
        // Never let one failing message break the chain: later messages (e.g. init) must still run.
        this.queue = this.queue
          .then(() => this.core.handle(event.data))
          .catch((error) => {
            this.port.postMessage({
              type: 'log',
              lines: [`error: engine message "${event.data && event.data.type}" failed: ${error && error.message ? error.message : error}`],
              suppressed: 0,
            });
          });
      };
    }

    process(_inputs, outputs) {
      const output = outputs[0];
      if (output && output.length > 0) {
        this.core.render(output[0], output.length > 1 ? output[1] : output[0]);
      }
      return true;
    }
  }

  if (!globalThis.__csoundPortfolioProcessorRegistered) {
    registerProcessor(PROCESSOR_NAME, CsoundPortfolioProcessor);
    globalThis.__csoundPortfolioProcessorRegistered = true;
  }
}
