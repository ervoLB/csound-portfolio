import { describe, expect, it, vi } from 'vitest';
import { CsoundCore } from '../../player/engine/csound-worklet.js';
import { CsoundEngine, type AudioContextLike, type EngineEnvironment, type WorkletNodeLike } from '../../player/engine/CsoundEngine';
import { csd, csoundModule, QUANTUM } from './harness';

/** A fake AudioWorklet setup that runs the real CsoundCore in-process. */
function fakeEnvironment(options: { failAddModule?: boolean; wasm?: () => Promise<ArrayBuffer> } = {}) {
  const cores: CsoundCore[] = [];
  let wasmLoads = 0;
  const contexts: { state: string; resumed: number }[] = [];

  const env: EngineEnvironment = {
    workletUrl: 'csound-worklet.js',
    createContext() {
      const ctx = {
        sampleRate: 48000,
        state: 'suspended',
        resumed: 0,
        destination: {},
        audioWorklet: {
          addModule: async () => {
            if (options.failAddModule) throw new Error('addModule failed');
          },
        },
        async resume() {
          ctx.resumed++;
          ctx.state = 'running';
        },
      };
      contexts.push(ctx);
      return ctx as AudioContextLike;
    },
    createNode(): WorkletNodeLike {
      let queue = Promise.resolve();
      const node: WorkletNodeLike & { core: CsoundCore } = {
        core: undefined as unknown as CsoundCore,
        port: {
          onmessage: null,
          postMessage(message: any) {
            // Asynchronous, ordered delivery like a real MessagePort.
            queue = queue.then(() => new Promise((r) => setTimeout(r, 0))).then(() => node.core.handle(message));
          },
        },
        connect: () => undefined,
        disconnect: () => undefined,
      };
      node.core = new CsoundCore({
        post: (msg) => setTimeout(() => node.port.onmessage?.({ data: msg }), 0),
      });
      cores.push(node.core);
      return node;
    },
    async loadWasm() {
      wasmLoads++;
      if (options.wasm) return options.wasm();
      const module = await csoundModule();
      return module as unknown as ArrayBuffer; // CsoundCore.init accepts a compiled Module too
    },
  };
  return {
    env,
    cores,
    contexts,
    get wasmLoads() {
      return wasmLoads;
    },
  };
}

function renderBlocks(core: CsoundCore, blocks: number): number {
  const l = new Float32Array(QUANTUM);
  const r = new Float32Array(QUANTUM);
  let peak = 0;
  for (let i = 0; i < blocks; i++) {
    core.render(l, r);
    for (let j = 0; j < QUANTUM; j++) peak = Math.max(peak, Math.abs(l[j]));
  }
  return peak;
}

const HEADER = 'sr = 48000\nksmps = 64\nnchnls = 2\n0dbfs = 1';
const tone = (freq: number) => csd(`${HEADER}\ninstr 1\n kAmp = chnget:k("amp")\n a1 = oscili(0.5 * kAmp, ${freq})\n out a1, a1\nendin`);

describe('CsoundEngine (main thread) with a fake worklet', () => {
  it('starts once, plays, switches instruments and reports state', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    const states: string[] = [];
    engine.on('state', ({ state }) => states.push(state));

    const first = await engine.play(tone(440), { channels: { amp: 1 } });
    expect(first).toMatchObject({ ok: true, sr: 48000, midi: false });
    expect(engine.state).toBe('playing');
    expect(renderBlocks(fake.cores[0], 40)).toBeGreaterThan(0.45);

    const second = await engine.play(tone(880), { channels: { amp: 0.5 } });
    expect(second.ok).toBe(true);
    expect(renderBlocks(fake.cores[0], 40)).toBeCloseTo(0.25, 2);

    expect(fake.cores).toHaveLength(1); // one worklet node for the page
    expect(fake.wasmLoads).toBe(1); // wasm fetched once
    expect(fake.contexts).toHaveLength(1);
    expect(states).toEqual(['starting', 'idle', 'compiling', 'playing', 'compiling', 'playing']);
  });

  it('auto-detects MIDI and only forwards MIDI to MIDI instruments', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    const midiCsd = csd(`${HEADER}\nmassign 0, 2\ninstr 1\nendin\ninstr 2\n a1 = oscili(ampmidi(0.5), cpsmidi())\n out a1, a1\nendin`);
    const result = await engine.play(midiCsd);
    expect(result).toMatchObject({ ok: true, midi: true });
    expect(engine.midiEnabled).toBe(true);
    engine.midi(0x90, 60, 127);
    await new Promise((r) => setTimeout(r, 20));
    expect(renderBlocks(fake.cores[0], 40)).toBeGreaterThan(0.3);

    const plain = await engine.play(tone(440), { channels: { amp: 1 } });
    expect(plain).toMatchObject({ ok: true, midi: false });
    const post = vi.spyOn(fake.cores[0], 'midi');
    engine.midi(0x90, 60, 127);
    await new Promise((r) => setTimeout(r, 20));
    expect(post).not.toHaveBeenCalled();
  });

  it('respects an explicit MIDI override', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    expect(await engine.play(tone(440), { midi: 'on' })).toMatchObject({ ok: true, midi: true });
    const midiCsd = csd(`${HEADER}\nmassign 0, 2\ninstr 2\n out a(0), a(0)\nendin`);
    expect(await engine.play(midiCsd, { midi: 'off' })).toMatchObject({ ok: true, midi: false });
  });

  it('reports compile errors and recovers', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    const logs: string[] = [];
    engine.on('log', ({ lines }) => logs.push(...lines));
    const bad = await engine.play(csd(`${HEADER}\ninstr 1\n a1 = notanopcode(1)\n out a1, a1\nendin`));
    expect(bad.ok).toBe(false);
    expect(engine.state).toBe('error');
    expect(logs.join('\n')).toMatch(/notanopcode/);
    expect((await engine.play(tone(440))).ok).toBe(true);
    expect(engine.state).toBe('playing');
  });

  it('marks earlier play() calls as superseded when a newer one starts', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    const [a, b] = await Promise.all([engine.play(tone(300)), engine.play(tone(600))]);
    expect(a).toMatchObject({ ok: false, superseded: true });
    expect(b.ok).toBe(true);
    expect(engine.state).toBe('playing');
  });

  it('stops, and a stop during startup cancels the pending play', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    const pending = engine.play(tone(440));
    await engine.stop();
    expect(await pending).toMatchObject({ superseded: true });
    expect((await engine.play(tone(440), { channels: { amp: 1 } })).ok).toBe(true);
    await engine.stop();
    expect(engine.state).toBe('stopped');
    expect(renderBlocks(fake.cores[0], 10)).toBe(0);
  });

  it('emits ended when a finite score finishes', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    const ended = new Promise<void>((resolve) => engine.on('ended', () => resolve()));
    await engine.play(csd(`${HEADER}\ninstr 1\n out a(0), a(0)\nendin`, 'i 1 0 0.05'));
    renderBlocks(fake.cores[0], 40);
    await ended;
    expect(engine.state).toBe('ended');
  });

  it('forwards watched channels, channel writes and reads', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    engine.watch(['out']); // before start: replayed after init
    await engine.play(csd(`${HEADER}\ninstr 1\n chnset chnget:k("in") * 2, "out"\nendin`), { channels: { in: 1 } });
    const values: number[] = [];
    engine.on('channels', ({ values: v }) => values.push(v.out));
    engine.setChannel('in', 3);
    await new Promise((r) => setTimeout(r, 20));
    renderBlocks(fake.cores[0], 20);
    await new Promise((r) => setTimeout(r, 20));
    expect(values.at(-1)).toBe(6);
    expect(await engine.getChannel('out')).toBe(6);
  });

  it('surfaces a wasm download failure and can retry', async () => {
    let attempts = 0;
    const real = fakeEnvironment();
    const fake = fakeEnvironment({
      wasm: async () => {
        attempts++;
        if (attempts === 1) throw new Error('network down');
        return (await csoundModule()) as unknown as ArrayBuffer;
      },
    });
    void real;
    const engine = new CsoundEngine({ environment: fake.env });
    const first = await engine.play(tone(440));
    expect(first).toMatchObject({ ok: false, error: 'network down' });
    expect(engine.state).toBe('error');
    const second = await engine.play(tone(440));
    expect(second.ok).toBe(true);
  });

  it('starts correctly when watch() and play() are called while the wasm is still downloading', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fake = fakeEnvironment({
      wasm: async () => {
        await gate;
        return (await csoundModule()) as unknown as ArrayBuffer;
      },
    });
    const engine = new CsoundEngine({ environment: fake.env });
    const unlocking = engine.unlock(); // e.g. the first pointerdown on the page
    await new Promise((r) => setTimeout(r, 10)); // worklet node exists, wasm not yet
    engine.watch(['out']);
    engine.setChannel('in', 2);
    const playing = engine.play(csd(`${HEADER}\ninstr 1\n chnset chnget:k("in") * 2, "out"\nendin`), { channels: { in: 1 } });
    release();
    await unlocking;
    expect(await playing).toMatchObject({ ok: true });
    expect(engine.state).toBe('playing');
  });

  it('reports busy only while an instrument plays or a play request is pending', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    const unlocking = engine.unlock();
    expect(engine.busy).toBe(false); // warming up is not busy
    await unlocking;
    const playing = engine.play(tone(440));
    expect(engine.busy).toBe(true);
    await playing;
    expect(engine.busy).toBe(true);
    await engine.stop();
    expect(engine.busy).toBe(false);
  });

  it('surfaces a worklet failure', async () => {
    const fake = fakeEnvironment({ failAddModule: true });
    const engine = new CsoundEngine({ environment: fake.env });
    expect(await engine.play(tone(440))).toMatchObject({ ok: false, error: 'addModule failed' });
  });

  it('resumes a suspended AudioContext on unlock and on play', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    await engine.unlock();
    expect(fake.contexts[0].state).toBe('running');
    fake.contexts[0].state = 'suspended';
    await engine.play(tone(440));
    expect(fake.contexts[0].state).toBe('running');
  });

  it('unlocks on the first gesture only', async () => {
    const fake = fakeEnvironment();
    const engine = new CsoundEngine({ environment: fake.env });
    const target = new EventTarget();
    const unlock = vi.spyOn(engine, 'unlock');
    engine.installGestureUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    expect(unlock).toHaveBeenCalledTimes(1);
    await engine.unlock();
  });
});
